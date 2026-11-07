// Telegram Mini App initData verification (HMAC-SHA256).
// Proves the payload came from a real Telegram user inside the Web App, so the
// backend can trust the student identity WITHOUT exposing any client secret.
// Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env.js";

export interface VerifiedUser {
  id: number;
  name: string;
}

/** Compute the expected hash for a given initData string. */
function computeHash(dataCheckString: string): string {
  // secret key = HMAC-SHA256(key="WebAppData", msg=botToken)
  const secretKey = createHmac("sha256", "WebAppData")
    .update(env.telegramBotToken)
    .digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

/**
 * Validate the raw initData string sent by the Mini App.
 * @returns the verified user, or null if the signature/age check fails.
 */
export function verifyInitData(initData: string): VerifiedUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return null;

    // data-check-string = all key/value pairs except "hash", sorted, newline-joined.
    params.delete("hash");
    const entries = [...params.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

    // Constant-time comparison to avoid timing attacks.
    const expected = computeHash(dataCheckString);
    if (
      expected.length !== hash.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))
    ) {
      return null;
    }

    // Reject stale auth (Telegram sets auth_date).
    const authDate = Number(params.get("auth_date") ?? 0);
    if (Math.floor(Date.now() / 1000) - authDate > 86_400) return null;

    const user = JSON.parse(params.get("user") ?? "{}");
    if (!user.id) return null;
    return { id: user.id, name: user.first_name ?? "Student" };
  } catch {
    return null;
  }
}
