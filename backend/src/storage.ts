// Downloads the Telegram photo and uploads it to Supabase Storage,
// returning a public URL that Groq Vision can fetch.
import { supabase } from './supabase.js';
import { env } from './env.js';
import type { Bot } from 'grammy';

/**
 * @param fileId Telegram file_id of the largest photo size.
 * @returns Publicly accessible URL of the stored image.
 */
export async function storeTelegramPhoto(bot: Bot, fileId: string): Promise<string> {
  // 1. Resolve the Telegram file download URL (token stays server-side).
  const file = await bot.api.getFile(fileId);
  const tgUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`;
  const res = await fetch(tgUrl);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // 2. Upload to Supabase Storage (unique, non-guessable key).
  const ext = (file.file_path?.split('.').pop() ?? 'jpg').toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(env.imageBucket)
    .upload(path, buffer, { contentType: `image/${ext}`, upsert: false });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  // 3. Return the public URL (bucket is public for Groq to read).
  const { data } = supabase.storage.from(env.imageBucket).getPublicUrl(path);
  return data.publicUrl;
}
