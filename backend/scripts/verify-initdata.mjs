// Debug helper: verify a real initData string against the token in backend/.env
// Usage: node scripts/verify-initdata.mjs "<initData string from Telegram.WebApp.initData>"
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const token = /^TELEGRAM_BOT_TOKEN=(.+)$/m.exec(envText)?.[1]?.trim();
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN not found in backend/.env");
  process.exit(1);
}

const initData = process.argv[2];
if (!initData) {
  console.error('Usage: node scripts/verify-initdata.mjs "<initData>"');
  process.exit(1);
}

const params = new URLSearchParams(initData);
const hash = params.get("hash");
if (!hash) {
  console.error("No hash in initData — is this Telegram.WebApp.initData?");
  process.exit(1);
}
params.delete("hash");
const entries = [...params.entries()].sort(([a], [b]) =>
  a < b ? -1 : a > b ? 1 : 0,
);
const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
const expected = createHmac("sha256", secretKey)
  .update(dataCheckString)
  .digest("hex");

const ok =
  expected.length === hash.length &&
  timingSafeEqual(Buffer.from(expected), Buffer.from(hash));

console.log("signature valid:", ok);
console.log(
  "auth_date      :",
  params.get("auth_date"),
  "(now:",
  Math.floor(Date.now() / 1000) + ")",
);
console.log("start_param    :", params.get("start_param"));
try {
  const user = JSON.parse(params.get("user") ?? "{}");
  console.log("user           :", user.id, user.first_name);
} catch {
  console.log("user           : <unparseable>");
}
if (!ok) {
  console.log("\nexpected hash:", expected);
  console.log("received hash:", hash);
  console.log(
    "\n=> If auth_date is fresh, the token in backend/.env differs from the one the Mini App was opened with (check Render env TELEGRAM_BOT_TOKEN).",
  );
}
