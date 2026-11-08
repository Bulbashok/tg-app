// GrammY bot: teacher-only image ingestion -> AI vision parse -> approval -> save.
import { Bot, InlineKeyboard, Context } from "grammy";
import { env, isTeacher } from "./env.js";
import { supabase } from "./supabase.js";
import { storeTelegramPhoto } from "./storage.js";
import { parseImageToExercise } from './ai.js';
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
bot.command("start", (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.reply("This bot is private.");
  return ctx.reply(
    "👩‍🏫 Teacher console ready.\n\n" +
      "Send a screenshot of a textbook exercise and I will turn it into an " +
      "interactive task. Review my draft, then tap ✅ to publish a student link.",
  );
});

bot.command("help", (ctx) =>
  ctx.reply("Send a textbook photo, or /list to see published exercises."),
);

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
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`⚠️ Could not parse this page:\n${msg.slice(0, 900)}`);
  }
});

// --- Approval callbacks ------------------------------------------------------
bot.callbackQuery(/^(confirm|cancel):([0-9a-f-]{8})$/, async (ctx: Context) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.answerCallbackQuery();

  // NOTE: grammY's ctx.match is a full RegExpMatchArray ([0] = whole string),
  // so parse the raw callback data directly instead.
  const [action, draftId] = (ctx.callbackQuery?.data ?? '').split(':');
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

  // Return the Telegram Web App link format the user asked for.
  const link = webAppLink(data.id);
  const deep = shareLink(data.id);
  const kb = new InlineKeyboard().webApp("🎓 Open Exercise", link);
  if (env.tmeAppUrl) {
    // Native Telegram share sheet: pick a student, link is sent as text.
    kb.row().url(
      "📤 Share with students",
      `https://t.me/share/url?url=${encodeURIComponent(deep)}&text=${encodeURIComponent(data.title)}`,
    );
  }
  await ctx.editMessageText(
    `✅ Published!\n\n📘 ${data.title}\n\n${
      env.tmeAppUrl
        ? `🔗 ${deep}\n\n👉 Press "Share" or copy the link above —\nit opens the exercise for any student.`
        : `👉 Press the button to open the exercise.\n\nℹ️ Telegram strips inline buttons when a\nmessage is forwarded. To share with students,\nregister the Mini App in @BotFather (/newapp)\nand set TME_APP_URL — then links work everywhere.`
    }`,
    { reply_markup: kb },
  );
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
export async function alertTeacher(payload: {
  exerciseTitle: string;
  studentName: string;
  score: string;
  errorsCount: number;
}): Promise<void> {
  await bot.api.sendMessage(
    Number(env.teacherId),
    `📥 New result\n\n👤 ${payload.studentName}\n📘 ${payload.exerciseTitle}\n` +
      `🏆 Score: ${payload.score}\n❌ Errors: ${payload.errorsCount}`,
  );
}
