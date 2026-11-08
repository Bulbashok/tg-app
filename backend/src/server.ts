// Process entry for Render: one Node process runs both
//   • grammY long-polling (no public webhook/TLS setup needed)
//   • Express HTTP server  (health check + student-score alerts from the Mini App)
import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { bot, alertTeacher } from "./bot.js";
import { generateFormHints } from "./ai.js";
import { verifyInitData } from "./telegramAuth.js";
import { supabase } from "./supabase.js";

const app = express();
// The Mini App (Vercel origin) calls /api/submit with a custom header
// (x-tg-init-data) -> browser sends a CORS preflight first. Security does NOT
// rely on CORS here: every request is still HMAC-verified via initData.
app.use(cors({ maxAge: 3600 }));
app.use(express.json({ limit: "32kb" })); // tiny payloads only -> cheap DoS guard

// Render health check target.
app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * Called by the React Mini App when a student finishes an exercise.
 * The raw Telegram initData string is HMAC-verified here, so we trust the
 * student identity WITHOUT shipping any secret inside the client bundle.
 * The backend then (a) persists the submission with the service role and
 * (b) DM's the teacher.
 */
app.post("/api/submit", async (req, res) => {
  const initData = String(req.headers["x-tg-init-data"] ?? "");
  const user = verifyInitData(initData);
  if (!user) return res.status(401).json({ error: "invalid initData" });

  const { exerciseId, score, errors } = req.body ?? {};
  if (!exerciseId || !score)
    return res.status(400).json({ error: "missing fields" });

  try {
    // Upsert the student, then insert the submission using the service role.
    const { data: student } = await supabase
      .from("students")
      .upsert(
        { telegram_id: user.id, name: user.name },
        { onConflict: "telegram_id" },
      )
      .select("id")
      .single();

    const { error: subErr } = await supabase.from("submissions").insert({
      exercise_id: exerciseId,
      student_id: student?.id,
      score: String(score).slice(0, 20),
      errors: Array.isArray(errors) ? errors : [],
    });
    if (subErr) throw new Error(subErr.message);

    // Look up the exercise for a friendly teacher alert; word-form also
    // needs the sentence context (content) to explain each mistake.
    const { data: ex } = await supabase
      .from("exercises")
      .select("title, task_type, content")
      .eq("id", exerciseId)
      .single();

    // Grammar hints per mistake — only for word-form, where "why this form"
    // is the actual learning moment. null on any failure: the score is
    // already saved, hints are decoration, never critical.
    let hints: { taskId: number; why: string }[] | null = null;
    if (
      ex?.task_type === "word-form" &&
      Array.isArray(errors) &&
      errors.length
    ) {
      type Item = { id?: unknown; before?: unknown; after?: unknown; hint?: unknown };
      const items: Item[] =
        (ex.content as { items?: Item[] } | null)?.items ?? [];
      const mistakes = errors
        .slice(0, 13)
        .map((e: Record<string, unknown>) => {
          const item = items.find((it) => String(it.id) === String(e.taskId));
          return {
            taskId: Number(e.taskId),
            your: String(e.your ?? ""),
            correct: String(e.correct ?? ""),
            before: String(item?.before ?? ""),
            after: String(item?.after ?? ""),
            hint: String(item?.hint ?? ""),
          };
        })
        .filter((m) => Number.isFinite(m.taskId));
      hints = await generateFormHints({ mistakes });
    }

    // Teacher notification must NOT fail the student's submission: if the
    // DM is rate-limited (429) or blocked, the score is already saved.
    try {
      await alertTeacher({
        exerciseTitle: ex?.title ?? "Exercise",
        studentName: user.name,
        score: String(score).slice(0, 20),
        errorsCount: Array.isArray(errors) ? errors.length : 0,
        errors: Array.isArray(errors) ? errors : [],
        hints,
      });
    } catch (err) {
      console.error("teacher alert skipped:", describeTelegramError(err));
    }

    res.json({ ok: true, hints });
  } catch (err) {
    console.error("submit failed", err);
    res.status(502).json({ error: "processing failed" });
  }
});

// Start HTTP + bot polling together.
app.listen(env.port, () => console.log(`HTTP ready on :${env.port}`));

/**
 * grammY wraps every failed Telegram API call in GrammyError; the raw stack
 * top is useless in logs — surface method + code + description instead.
 */
function describeTelegramError(err: unknown): string {
  const e = err as {
    method?: string;
    error_code?: number;
    description?: string;
  };
  if (e?.method)
    return `${e.method} -> ${e.error_code ?? ""} ${e.description ?? ""}`.trim();
  return err instanceof Error ? err.message : String(err);
}

bot.catch((err) =>
  console.error("bot error:", describeTelegramError(err.error)),
);

// Make the command menu (the "/" list in Telegram) visible to everyone.
void bot.api
  .setMyCommands([
    { command: "start", description: "Open dashboard" },
    { command: "library", description: "Browse exercises (teacher)" },
    { command: "list", description: "Latest exercises (teacher)" },
    { command: "help", description: "How to use this bot" },
  ])
  .catch((err) => console.error("setMyCommands failed:", err.message));

// Long polling (no public webhook/TLS needed on Render). Stop cleanly on
// SIGTERM/SIGINT so Render restarts don't leave a dangling getUpdates lock.
void bot.start();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await bot.stop();
    process.exit(0);
  });
}
