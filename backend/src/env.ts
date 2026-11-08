// Central, fail-fast environment configuration.
// Every secret lives in .env — nothing is hard-coded.
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
  // Telegram accounts allowed to drive the bot (photo upload, confirm, /list).
  // Comma-separated: TELEGRAM_TEACHER_ID=472639507,423362444
  teacherIds: required("TELEGRAM_TEACHER_ID")
    .split(",")
    .map((s) => BigInt(s.trim()))
    .filter((n) => n > 0n),
  botUsername: required("BOT_USERNAME"), // without the leading '@'
  // OpenAI-compatible vision provider. Default: Groq + qwen3.8-27b (current
  // Groq vision model; Llama vision models were removed). Any compatible API
  // works via AI_BASE_URL, e.g. OpenRouter: https://openrouter.ai/api/v1.
  aiBaseUrl: process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1",
  aiApiKey: required("AI_API_KEY"),
  aiModel: process.env.AI_MODEL ?? "qwen/qwen3.8-27b",
  // Groq free tier allows only 1000 output tokens/min for qwen3.8-27b, and
  // rejects requests whose EXPECTED output exceeds it -> cap at the limit.
  aiMaxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 1000),
  supabaseUrl: required("SUPABASE_URL"),
  // Service-role key: bypasses RLS. Backend-only, never sent to the client.
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  imageBucket: process.env.SUPABASE_IMAGE_BUCKET ?? "textbook-images",
  // Public URL of the deployed Vite app (https required by Telegram).
  webAppUrl: required("WEB_APP_URL").replace(/\/+$/, ""),
  // Optional: short link from BotFather /newapp, e.g.
  // https://t.me/eng_task_master_bot/english — enables forwardable/shareable
  // deep links that open WITH initData (plain webapp URLs don't survive that).
  tmeAppUrl: (process.env.TME_APP_URL ?? "").replace(/\/+$/, ""),
  port: Number(process.env.PORT ?? 3000), // Render injects PORT
};

export function isTeacher(userId: number | bigint): boolean {
  return env.teacherIds.some((t) => t === BigInt(userId));
}
