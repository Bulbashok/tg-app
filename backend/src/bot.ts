// GrammY bot: teacher-only photo ingestion -> Groq parse -> approval -> save.
import { Bot, InlineKeyboard, Context } from 'grammy';
import { env, isTeacher } from './env.js';
import { supabase } from './supabase.js';
import { storeTelegramPhoto } from './storage.js';
import { parseImageToExercise } from './groq.js';
import { formatPreview } from './preview.js';
import { putDraft, popDraft } from './draftStore.js';
import type { ExerciseRow } from './types.js';

export const bot = new Bot(env.telegramBotToken);

/** Deep-link style Mini App URL carrying the exercise id. */
function webAppLink(exerciseId: string): string {
  return `${env.webAppUrl}/?exercise=${exerciseId}`;
}

// --- Commands ---------------------------------------------------------------
bot.command('start', (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return ctx.reply('This bot is private.');
  return ctx.reply(
    '👩‍🏫 Teacher console ready.\n\n' +
      'Send a screenshot of a textbook exercise and I will turn it into an ' +
      'interactive task. Review my draft, then tap ✅ to publish a student link.',
  );
});

bot.command('help', (ctx) =>
  ctx.reply('Send a textbook photo, or /list to see published exercises.'),
);

// --- Photo ingestion (teacher only) ----------------------------------------
bot.on('message:photo', async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) {
    return ctx.reply('⛔ Only the teacher can upload exercises.');
  }

  const photo = ctx.message.photo.at(-1)!; // highest resolution
  await ctx.reply('🤖 Parsing with Llama Vision, one moment…');

  try {
    const imageUrl = await storeTelegramPhoto(bot, photo.file_id);
    const draft = await parseImageToExercise(imageUrl);
    const draftId = putDraft(draft);

    const kb = new InlineKeyboard()
      .text('✅ Confirm & Create', `confirm:${draftId}`)
      .row()
      .text('❌ Cancel', `cancel:${draftId}`);

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

  const [action, draftId] = ctx.match as string[];
  await ctx.answerCallbackQuery();

  if (action === 'cancel') {
    popDraft(draftId);
    return ctx.editMessageText('Cancelled. Send another photo to retry.', {
      reply_markup: new InlineKeyboard(),
    });
  }

  const draft = popDraft(draftId);
  if (!draft) return ctx.editMessageText('⌛️ This preview expired. Re-send the photo.');

  // Persist to Supabase (service_role bypasses RLS).
  const { data, error } = await supabase
    .from('exercises')
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
  const shareKb = new InlineKeyboard().webApp('🎓 Open Exercise', link);
  await ctx.editMessageText(
    `✅ Published!\n\n📘 ${data.title}\n🔗 ${link}\n\nTap below to test it inside Telegram.`,
    { reply_markup: shareKb },
  );
});

// --- List recent exercises ---------------------------------------------------
bot.command('list', async (ctx) => {
  if (!isTeacher(ctx.from?.id ?? 0)) return;
  const { data } = await supabase
    .from('exercises')
    .select('id,title,task_type,created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  const text = (data ?? [])
    .map((e) => `• ${e.title} (${e.task_type})\n  ${webAppLink(e.id)}`)
    .join('\n\n');
  await ctx.reply(text || 'No exercises yet.');
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
