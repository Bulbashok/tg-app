// GrammY bot: teacher-only image ingestion -> AI vision parse -> approval -> save.
import { Bot, InlineKeyboard, Context } from "grammy";
import { ZodError } from "zod";
import { env, isTeacher } from "./env.js";
import { supabase } from "./supabase.js";
import { storeTelegramPhoto } from "./storage.js";
import { parseImageToExercise } from "./ai.js";
import { formatPreview } from "./preview.js";
import { putDraft, popDraft } from "./draftStore.js";
import type { ExerciseRow } from "./types.js";

export const bot = new Bot(env.telegramBotToken);

/** Mini App URL for inline web_app buttons (must be the app's own domain). */
function webAppLink(exerciseId: string): string {
  return `${env.webAppUrl}/?exercise=${exerciseId}`;
}

/** Forwardable/shareable link. If TME_APP_URL is set (BotFather /newapp),
 * a t.me deep link is used: tapping it opens the Mini App WITH initData,
 * so student scores save even from plain text in any chat. */
function shareLink(exerciseId: string): string {
  return env.tmeAppUrl
    ? `${env.tmeAppUrl}?startapp=ex_${exerciseId}`
    : webAppLink(exerciseId);
}

// --- Commands ---------------------------------------------------------------
bot.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  if (isTeacher(from.id)) {
    return ctx.reply(
      "👩‍🏫 Teacher console ready.\n\n" +
        "Send a screenshot of a textbook exercise and I will turn it into an " +
        "interactive task. Review my draft, then tap ✅ to publish and assign it.",
      { reply_markup: new InlineKeyboard().text("📚 Library", "lib:gap-fill:0") },
    );
  }
  // Student: register on first /start, then show their dashboard.
  await upsertStudent(from);
  const { text, kb } = await buildMyExercises(from.id);
  return ctx.reply(text, { reply_markup: kb });
});

bot.command("help", (ctx) =>
  ctx.reply(
    "Teacher: send a textbook photo to create an exercise, /library to browse.\n" +
      "Student: /start opens your exercise list.",
  ),
);

// --- Shared little helpers ---------------------------------------------------
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Register/refresh a student row from a Telegram `from` object. */
async function upsertStudent(from: { id: number; first_name: string; username?: string }) {
  await supabase
    .from("students")
    .upsert(
      { telegram_id: from.id, name: from.first_name || from.username || "Student" },
      { onConflict: "telegram_id" },
    );
}

// --- Image ingestion (teacher only) -----------------------------------------
// Accepts BOTH compressed photos and raw image documents: desktop Telegram
// often sends screenshots as documents, which a photo-only listener ignores.
type MaybeImage = {
  photo?: Array<{ file_id: string }>;
  document?: { mime_type?: string; file_id: string };
};

function extractImageFileId(message: MaybeImage): string | null {
  if ("photo" in message && message.photo?.length) {
    return message.photo[message.photo.length - 1].file_id; // highest resolution
  }
  if (
    "document" in message &&
    message.document?.mime_type?.startsWith("image/")
  ) {
    return message.document.file_id;
  }
  return null;
}

bot.on("message", async (ctx, next) => {
  const fileId = extractImageFileId(ctx.message);
  if (!fileId) return next(); // not an image — leave it to other handlers

  if (!isTeacher(ctx.from?.id ?? 0)) {
    return ctx.reply("⛔ Only the teacher can upload exercises.");
  }

  await ctx.reply("🤖 Parsing with AI vision (Qwen3.8), one moment…");

  try {
    const imageUrl = await storeTelegramPhoto(bot, fileId);
    const draft = await parseImageToExercise(imageUrl);
    const draftId = putDraft(draft);

    const kb = new InlineKeyboard()
      .text("✅ Confirm & Create", `confirm:${draftId}`)
      .row()
      .text("❌ Cancel", `cancel:${draftId}`);

    await ctx.reply(formatPreview(draft), {
      reply_markup: kb,
    });
  } catch (err) {
    await ctx.reply(`⚠️ Could not parse this page:\n${describeParseError(err)}`);
  }
});

/** Turn a thrown error into a short human-readable line for the teacher.
 * Zod validation failures are arrays of {path,message} -> render them nicely. */
function describeParseError(err: unknown): string {
  if (err instanceof ZodError) {
    return (
      "AI JSON не прошёл проверку:\n" +
      err.issues
        .map((i) => `• ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n")
        .slice(0, 850)
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Groq shared-capacity overload survived all SDK retries.
  if (/over capacity|503/i.test(msg))
    return (
      "Серверы Groq сейчас перегружены (модель общая у многих) — " +
      "попробуй отправить фото ещё раз через минуту.\n" +
      "Статус: https://groqstatus.com"
    );
  return msg.slice(0, 900);
}

// --- Approval callbacks ------------------------------------------------------
bot.callbackQuery(/^(confirm|cancel):([0-9a-f-]{8})$/, async (ctx: Context) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.answerCallbackQuery();

  // NOTE: grammY's ctx.match is a full RegExpMatchArray ([0] = whole string),
  // so parse the raw callback data directly instead.
  const [action, draftId] = (ctx.callbackQuery?.data ?? "").split(":");
  await ctx.answerCallbackQuery();

  if (action === "cancel") {
    popDraft(draftId);
    return ctx.editMessageText("Cancelled. Send another photo to retry.", {
      reply_markup: new InlineKeyboard(),
    });
  }

  const draft = popDraft(draftId);
  if (!draft)
    return ctx.editMessageText("⌛️ This preview expired. Re-send the photo.");

  // Persist to Supabase (service_role bypasses RLS).
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      title: draft.title,
      instruction: draft.instruction,
      task_type: draft.task_type,
      content: draft.content,
    })
    .select()
    .single<ExerciseRow>();

  if (error) return ctx.editMessageText(`❌ Save failed: ${error.message}`);

  // Publish -> assign step: tap students to add the exercise to their
  // "My exercises" dashboard; ✅ Done shows the final link message.
  await renderAssignStep(ctx, { id: data.id, title: data.title });
});

// --- Library: four task-type tabs over all published exercises --------------
const LIB_TYPES = [
  { key: "gap-fill", tab: "🧩 Gap", full: "Gap-fill" },
  { key: "matching", tab: "🔗 Match", full: "Matching" },
  { key: "sorting", tab: "🗂 Sort", full: "Sorting" },
  { key: "word-form", tab: "✍ Forms", full: "Word-form" },
] as const;

const PAGE_SIZE = 8;

/** Build one library page: tab row + up to PAGE_SIZE items + nav. Shared by
 * the /library command (reply) and the lib: callbacks (edit in place). */
async function libraryView(
  type: string,
  page: number,
): Promise<{ text: string; kb: InlineKeyboard }> {
  const offset = page * PAGE_SIZE;
  const { data, count } = await supabase
    .from("exercises")
    .select("id,title,created_at", { count: "exact" })
    .eq("task_type", type)
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  const rows = data ?? [];
  const total = count ?? 0;
  const full = LIB_TYPES.find((t) => t.key === type)?.full ?? "Library";

  const kb = new InlineKeyboard();
  for (const t of LIB_TYPES)
    kb.text(t.key === type ? `▣ ${t.tab}` : `  ${t.tab}`, `lib:${t.key}:0`);
  kb.row();
  for (const [i, e] of rows.entries())
    kb.text(`${offset + i + 1}. ${e.title}`.slice(0, 60), `ex:${e.id}`).row();
  if (offset > 0) kb.text("◀ Prev", `lib:${type}:${page - 1}`);
  if (offset + rows.length < total) kb.text("Next ▶", `lib:${type}:${page + 1}`);

  return {
    text: rows.length
      ? `📚 ${full} — ${total} exercises · page ${page + 1}/${Math.max(1, Math.ceil(total / PAGE_SIZE))}`
      : `📚 ${full}\n\nNothing here yet.`,
    kb,
  };
}

bot.command("library", async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.reply("Teacher only.");
  const { text, kb } = await libraryView("gap-fill", 0);
  await ctx.reply(text, { reply_markup: kb });
});

bot.callbackQuery(/^lib:/, async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.answerCallbackQuery();
  const [, type, pageStr] = (ctx.callbackQuery?.data ?? "").split(":");
  await ctx.answerCallbackQuery();
  const { text, kb } = await libraryView(type, Number(pageStr) || 0);
  await ctx.editMessageText(text, { reply_markup: kb });
});

// One exercise: open / share / get back to the tab.
bot.callbackQuery(/^ex:/, async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.answerCallbackQuery();
  const id = (ctx.callbackQuery?.data ?? "").slice(3);
  await ctx.answerCallbackQuery();
  const { data: ex } = await supabase
    .from("exercises")
    .select("id,title,instruction,task_type,created_at")
    .eq("id", id)
    .maybeSingle();
  if (!ex)
    return ctx.reply("Exercise not found (deleted?).");

  const kb = new InlineKeyboard().webApp("🎓 Open", webAppLink(ex.id));
  if (env.tmeAppUrl)
    kb.row().url(
      "📤 Share",
      `https://t.me/share/url?url=${encodeURIComponent(shareLink(ex.id))}&text=${encodeURIComponent(ex.title)}`,
    );
  kb.row().text("🗑 Delete", `del:${ex.id}`);
  kb.row().text("↩ Back to library", `lib:${ex.task_type}:0`);

  // Sent as a NEW message so the library list stays browsable.
  const full = LIB_TYPES.find((t) => t.key === ex.task_type)?.full ?? ex.task_type;
  await ctx.reply(
    `📘 ${ex.title}\n${full} · ${fmtDate(ex.created_at)}\n\n${ex.instruction}\n\n🔗 ${shareLink(ex.id)}`,
    { reply_markup: kb },
  );
});

// Delete needs a second tap on the same card — cheap guard against
// wiping a term of exercises by an errant finger.
bot.callbackQuery(/^del:/, async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.answerCallbackQuery();
  const id = (ctx.callbackQuery?.data ?? "").split(":")[1];
  await ctx.answerCallbackQuery();
  const { data: ex } = await supabase
    .from("exercises")
    .select("id,title")
    .eq("id", id)
    .maybeSingle();
  if (!ex)
    return ctx.editMessageText("Already deleted.", {
      reply_markup: new InlineKeyboard(),
    });
  await ctx.editMessageText(
    `🗑 Delete “${ex.title}”?\n\nSubmissions and assignments of this exercise\nwill be deleted too. This cannot be undone.`,
    {
      reply_markup: new InlineKeyboard()
        .text("✅ Yes, delete", `delgo:${ex.id}`)
        .row()
        .text("↩ Keep it", `ex:${ex.id}`),
    },
  );
});

bot.callbackQuery(/^delgo:/, async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.answerCallbackQuery();
  const id = (ctx.callbackQuery?.data ?? "").split(":")[1];
  await ctx.answerCallbackQuery();
  const { data: ex } = await supabase
    .from("exercises")
    .select("id,title,task_type")
    .eq("id", id)
    .maybeSingle();
  if (!ex)
    return ctx.editMessageText("Already deleted.", {
      reply_markup: new InlineKeyboard(),
    });
  const { error } = await supabase.from("exercises").delete().eq("id", id);
  if (error)
    return ctx.editMessageText(`❌ Delete failed: ${error.message}`);
  await ctx.editMessageText(`🗑 Deleted: ${ex.title}`, {
    reply_markup: new InlineKeyboard().text(
      "↩ Back to library",
      `lib:${ex.task_type}:0`,
    ),
  });
});

// --- Publish -> assign to students ------------------------------------------
/** Final "Published" message with open/share buttons (also reached via ✅ Done). */
function publishFinal(ex: { id: string; title: string }): {
  text: string;
  kb: InlineKeyboard;
} {
  const kb = new InlineKeyboard().webApp("🎓 Open Exercise", webAppLink(ex.id));
  if (env.tmeAppUrl)
    kb.row().url(
      "📤 Share with students",
      `https://t.me/share/url?url=${encodeURIComponent(shareLink(ex.id))}&text=${encodeURIComponent(ex.title)}`,
    );
  const text = env.tmeAppUrl
    ? `✅ Published!\n\n📘 ${ex.title}\n\n🔗 ${shareLink(ex.id)}\n\n👉 Press "Share" or copy the link above —\nit opens the exercise for any student.`
    : `✅ Published!\n\n📘 ${ex.title}\n\n👉 Press the button to open the exercise.\n\nℹ️ Telegram strips inline buttons when a\nmessage is forwarded. To share with students,\nregister the Mini App in @BotFather (/newapp)\nand set TME_APP_URL — then links work everywhere.`;
  return { text, kb };
}

/** Extract telegram ids from `assignments.select("students(telegram_id)")`
 * rows. Embedded many-to-one arrives as an object; supabase-js types it as
 * an array without generated DB types — accept both shapes. */
function embeddedTelegramIds(rows: unknown[] | null): number[] {
  return (rows ?? [])
    .map((r: unknown) => {
      const s = (r as { students?: unknown }).students;
      const row = (Array.isArray(s) ? s[0] : s) as
        | { telegram_id?: number }
        | undefined;
      return row?.telegram_id;
    })
    .filter((v): v is number => typeof v === "number");
}

/** The step right after publishing: tap student names to assign (any number,
 * re-tap toggles nothing — assignments are idempotent), then Done. */
async function renderAssignStep(
  ctx: Context,
  ex: { id: string; title: string },
): Promise<unknown> {
  const { data: students } = await supabase
    .from("students")
    .select("telegram_id,name")
    .order("created_at", { ascending: true })
    .limit(20);

  if (!students?.length) {
    const { text, kb } = publishFinal(ex);
    return ctx.editMessageText(
      `${text}\n\nℹ️ No students have opened the bot yet —\nthey appear here after pressing /start.`,
      { reply_markup: kb },
    );
  }

  const { data: asg } = await supabase
    .from("assignments")
    .select("students(telegram_id)")
    .eq("exercise_id", ex.id);
  const assigned = new Set(
    embeddedTelegramIds(asg as unknown[] | null).map(String),
  );

  const kb = new InlineKeyboard();
  for (const s of students)
    kb
      .text(
        assigned.has(String(s.telegram_id)) ? `✓ ${s.name}` : `👤 ${s.name}`,
        `as:${ex.id}:${s.telegram_id}`,
      )
      .row();
  kb.text("✅ Done", `done:${ex.id}`);

  return ctx.editMessageText(
    `✅ Published: ${ex.title}\n\n👥 Tap students to assign (any number).\nThey will find it under "My exercises" here.`,
    { reply_markup: kb },
  );
}

bot.callbackQuery(/^as:/, async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.answerCallbackQuery();
  const [, exId, tgId] = (ctx.callbackQuery?.data ?? "").split(":");

  const { data: st } = await supabase
    .from("students")
    .select("id,name")
    .eq("telegram_id", Number(tgId))
    .maybeSingle();
  if (!st)
    return ctx.answerCallbackQuery({
      text: "Student not registered yet",
      show_alert: true,
    });

  const { error } = await supabase
    .from("assignments")
    .upsert(
      { exercise_id: exId, student_id: st.id },
      { onConflict: "exercise_id,student_id", ignoreDuplicates: true },
    );
  await ctx.answerCallbackQuery({
    text: error ? "Assign failed" : `Assigned to ${st.name} ✓`,
  });
  if (error) return;

  // Re-render the same step so the tapped name gets its ✓.
  const { data: ex } = await supabase
    .from("exercises")
    .select("id,title")
    .eq("id", exId)
    .single();
  if (ex) await renderAssignStep(ctx, ex);
});

bot.callbackQuery(/^done:/, async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.answerCallbackQuery();
  const exId = (ctx.callbackQuery?.data ?? "").split(":")[1];
  await ctx.answerCallbackQuery();
  const { data: ex } = await supabase
    .from("exercises")
    .select("id,title,instruction")
    .eq("id", exId)
    .single();
  if (!ex) return;

  // Push step: DM every assigned student their new exercise. Bots can only
  // DM users who have pressed /start once — those are exactly the students
  // that can appear in the assign list, but a failed leg must not stop the
  // others, so allSettled + a sent/total note in the final message.
  const { data: asg } = await supabase
    .from("assignments")
    .select("students(telegram_id)")
    .eq("exercise_id", ex.id);
  const tgIds = [...new Set(embeddedTelegramIds(asg as unknown[] | null))];

  let sentNote = "";
  if (tgIds.length) {
    const results = await Promise.allSettled(
      tgIds.map((id) =>
        bot.api.sendMessage(
          id,
          `📚 New exercise: ${ex.title}\n\n${ex.instruction}`,
          {
            reply_markup: new InlineKeyboard().webApp(
              "🎓 Open",
              webAppLink(ex.id),
            ),
          },
        ),
      ),
    );
    const sent = results.filter((r) => r.status === "fulfilled").length;
    sentNote =
      sent === tgIds.length
        ? `\n\n📤 Sent to ${sent} student${sent === 1 ? "" : "s"}.`
        : `\n\n📤 Sent to ${sent}/${tgIds.length} — the rest must press /start in this bot once.`;
  } else {
    sentNote = "\n\nℹ️ Nobody assigned — the link above still works manually.";
  }

  const { text, kb } = publishFinal(ex);
  await ctx.editMessageText(text + sentNote, { reply_markup: kb });
});

// --- Student dashboard: "My exercises" ---------------------------------------
async function buildMyExercises(
  tgId: number,
): Promise<{ text: string; kb: InlineKeyboard }> {
  const emptyKb = new InlineKeyboard().text("🔄 Refresh", "myex");
  const { data: st } = await supabase
    .from("students")
    .select("id")
    .eq("telegram_id", tgId)
    .maybeSingle();
  if (!st)
    return { text: "Press /start so I can meet you first.", kb: emptyKb };

  // Assignments + the student's own latest score per exercise, joined here
  // (PostgREST cannot filter submissions by two foreign keys at once).
  const [{ data: asg }, { data: subs }] = await Promise.all([
    supabase
      .from("assignments")
      .select("assigned_at, exercises(id,title,task_type)")
      .eq("student_id", st.id)
      .order("assigned_at", { ascending: false })
      .limit(30),
    supabase
      .from("submissions")
      .select("exercise_id, score, submitted_at")
      .eq("student_id", st.id)
      .order("submitted_at", { ascending: true })
      .limit(300),
  ]);

  const latest = new Map<string, string>();
  for (const s of subs ?? []) latest.set(String(s.exercise_id), s.score);

  // Embedded many-to-one arrives as a single object; supabase-js types it
  // as an array without generated DB types — read both shapes safely.
  const items = (asg ?? [])
    .map((r: unknown) => {
      const row = r as { assigned_at: string; exercises?: unknown };
      const ex = (Array.isArray(row.exercises) ? row.exercises[0] : row.exercises) as
        | { id: string; title: string }
        | undefined;
      return ex ? { ex, at: row.assigned_at } : null;
    })
    .filter((it): it is { ex: { id: string; title: string }; at: string } =>
      !!it,
    );
  const pending = items.filter((it) => !latest.has(it.ex.id));
  const done = items.filter((it) => latest.has(it.ex.id));

  if (!items.length)
    return {
      text: "🎓 My exercises\n\nNothing assigned yet.\nYour teacher assigns new exercises here.",
      kb: emptyKb,
    };

  let text = "🎓 My exercises\n";
  if (pending.length) {
    text += `\n📥 To do (${pending.length}):\n`;
    for (const it of pending)
      text += `  • ${it.ex.title} — since ${fmtDate(it.at)}\n`;
  }
  if (done.length) {
    text += `\n✅ Completed (${done.length}):\n`;
    for (const it of done)
      text += `  • ${it.ex.title} — ${latest.get(it.ex.id)}\n`;
  }

  // Buttons mirror the list: pending first (▶), then retryable results (🔁).
  const kb = new InlineKeyboard();
  let buttons = 0;
  for (const it of [...pending, ...done]) {
    if (buttons >= 15) break;
    const score = latest.get(it.ex.id);
    kb.webApp(
      (score ? `🔁 ${it.ex.title} · ${score}` : `▶️ ${it.ex.title}`).slice(0, 60),
      webAppLink(it.ex.id),
    ).row();
    buttons++;
  }
  kb.text("🔄 Refresh", "myex");
  return { text, kb };
}

bot.callbackQuery("myex", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;
  const { text, kb } = await buildMyExercises(ctx.from.id);
  await ctx.editMessageText(text, { reply_markup: kb });
});

// --- List recent exercises ---------------------------------------------------
bot.command("list", async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return;
  const { data } = await supabase
    .from("exercises")
    .select("id,title,task_type,created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (!data?.length) return ctx.reply("No exercises yet.");

  // One button per exercise (opens for the teacher; buttons don't survive
  // forwarding, which is why publishing uses shareable t.me links instead).
  const kb = new InlineKeyboard();
  for (const [i, e] of data.entries()) {
    const label = `${i + 1}. ${e.title}`.slice(0, 64);
    kb.webApp(label, webAppLink(e.id)).row();
  }
  await ctx.reply(
    "📚 Latest exercises — tap to open, or forward this message to students:",
    { reply_markup: kb },
  );
});

// --- Notify the teacher about a student submission (from the webhook) --------
type StudentError = {
  taskId?: unknown;
  /** Asked word (English term / base word / card text); absent for gap-fill. */
  label?: unknown;
  your?: unknown;
  correct?: unknown;
};

export async function alertTeacher(payload: {
  exerciseTitle: string;
  studentName: string;
  score: string;
  errorsCount: number;
  errors?: StudentError[];
  hints?: { taskId: number; why: string }[] | null;
}): Promise<void> {
  let text =
    `📥 New result\n\n👤 ${payload.studentName}\n📘 ${payload.exerciseTitle}\n` +
    `🏆 Score: ${payload.score}\n❌ Errors: ${payload.errorsCount}`;

  // Itemized mistakes so the teacher can review without opening the app.
  // Word-form mistakes carry an AI grammar hint on the next line.
  const hintById = new Map(
    (payload.hints ?? []).map((h) => [String(h.taskId), h.why]),
  );
  const clip = (v: unknown, n = 60) =>
    String(v ?? "—").replace(/\s+/g, " ").trim().slice(0, n);
  const lines = (payload.errors ?? [])
    .slice(0, 20) // Telegram limit guard; teacher sees the first 20
    .map((e, i) => {
      const what = e.label
        ? clip(e.label, 30)
        : `№${clip(e.taskId, 8)}`; // gap-fill has no word label
      const line = `${i + 1}) ${what}: ${clip(e.your)} → ${clip(e.correct)}`;
      const why = hintById.get(String(e.taskId ?? ""));
      return why ? `${line}\n   ↳ ${clip(why, 160)}` : line;
    });
  if (lines.length) {
    text += `\n\n❌ Mistakes:\n${lines.join("\n")}`;
    if (payload.errorsCount > lines.length)
      text += `\n… and ${payload.errorsCount - lines.length} more`;
  }

  // Every teacher gets the report; one blocked/rate-limited DM must not
  // swallow the notification for the others.
  await Promise.allSettled(
    env.teacherIds.map((id) => bot.api.sendMessage(Number(id), text)),
  );
}
