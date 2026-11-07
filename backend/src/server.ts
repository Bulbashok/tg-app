// Process entry for Render: one Node process runs both
//   • grammY long-polling (no public webhook/TLS setup needed)
//   • Express HTTP server  (health check + student-score alerts from the Mini App)
import express from "express";
import { env } from "./env.js";
import { bot, alertTeacher } from "./bot.js";
import { verifyInitData } from "./telegramAuth.js";
import { supabase } from "./supabase.js";

const app = express();
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

    // Look up the exercise title for a friendly teacher alert.
    const { data: ex } = await supabase
      .from("exercises")
      .select("title")
      .eq("id", exerciseId)
      .single();

    await alertTeacher({
      exerciseTitle: ex?.title ?? "Exercise",
      studentName: user.name,
      score: String(score).slice(0, 20),
      errorsCount: Array.isArray(errors) ? errors.length : 0,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("submit failed", err);
    res.status(502).json({ error: "processing failed" });
  }
});

// Start HTTP + bot polling together.
app.listen(env.port, () => console.log(`HTTP ready on :${env.port}`));

bot.catch((err) => console.error("bot error", err));

// Long polling (no public webhook/TLS needed on Render). Stop cleanly on
// SIGTERM/SIGINT so Render restarts don't leave a dangling getUpdates lock.
void bot.start();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await bot.stop();
    process.exit(0);
  });
}
