// Central, fail-fast environment configuration.
// Every secret lives in .env — nothing is hard-coded.
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  // Only this Telegram account may drive the bot (photo upload, confirm, etc.)
  teacherId: BigInt(required('TELEGRAM_TEACHER_ID')),
  botUsername: required('BOT_USERNAME'), // without the leading '@'
  groqApiKey: required('GROQ_API_KEY'),
  // Latest vision-capable Llama on Groq; override in .env when deprecated.
  groqModel: process.env.GROQ_MODEL ?? 'llama-3.2-11b-vision-preview',
  supabaseUrl: required('SUPABASE_URL'),
  // Service-role key: bypasses RLS. Backend-only, never sent to the client.
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  imageBucket: process.env.SUPABASE_IMAGE_BUCKET ?? 'textbook-images',
  // Public URL of the deployed Vite app (https required by Telegram).
  webAppUrl: required('WEB_APP_URL').replace(/\/+$/, ''),
  port: Number(process.env.PORT ?? 3000), // Render injects PORT
};

export function isTeacher(userId: number | bigint): boolean {
  return BigInt(userId) === env.teacherId;
}
