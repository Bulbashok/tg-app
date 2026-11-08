// Telegram Mini App initialization hook:
// - marks the app ready and expands it to full height
// - syncs the native background/header color with our SCSS theme
// - exposes the exercise id from WebApp init data / URL query
import { useEffect } from "react";
import { tg } from "../lib/telegram";

/** Resolve which exercise to show.
 *  Priority: tg.start_param (`t.me/bot/app?startapp=ex_<uuid>`) -> ?exercise=<uuid>. */
export function useExerciseId(): string | null {
  const startParam = tg?.initDataUnsafe?.start_param;
  if (startParam?.startsWith("ex_")) return startParam.slice(3);
  return new URLSearchParams(window.location.search).get("exercise");
}

export function useTelegramInit() {
  useEffect(() => {
    if (!tg) return; // opened in a normal browser (local dev)
    tg.ready();
    tg.expand();
    // Match the WebView chrome to OUR warm paper palette (not Telegram's
    // cool grays), picked per active color scheme.
    const dark = tg.colorScheme === "dark";
    const bg = dark ? "#201f1c" : "#faf9f6";
    tg.setHeaderColor?.(bg);
    tg.setBackgroundColor?.(bg);
  }, []);
}
