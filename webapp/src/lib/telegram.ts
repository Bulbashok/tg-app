// Thin, typed wrapper around the Telegram Mini Apps SDK
// (loaded globally from telegram.org/js/telegram-web-app.js in index.html).
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface InitDataUnsafe {
  user?: TelegramUser;
  start_param?: string;
}

export interface WebApp {
  ready: () => void;
  expand: () => void;
  initData: string; // signed string forwarded to the backend for verification
  initDataUnsafe: InitDataUnsafe;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (
      style: "light" | "medium" | "heavy" | "rigid" | "soft",
    ) => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  close: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

export const tg: WebApp | undefined = window.Telegram?.WebApp;

/** True when running inside the Telegram WebView (not a plain browser tab). */
export const isTelegramEnv = (): boolean => !!tg?.initDataUnsafe?.user;

/** Best-effort current student from the SDK (falls back to a guest for local dev). */
export function getStudent(): { id: number; name: string } {
  const user = tg?.initDataUnsafe?.user;
  return {
    id: user?.id ?? 0,
    name: user
      ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ""}`
      : "Guest",
  };
}

/** Fire haptic feedback if available (nice tactile UX inside Telegram). */
export function haptic(
  kind:
    | "light"
    | "medium"
    | "heavy"
    | "success"
    | "error"
    | "selection" = "light",
) {
  const hf = tg?.HapticFeedback;
  if (!hf) return;
  if (kind === "selection") hf.selectionChanged();
  else if (kind === "success" || kind === "error")
    hf.notificationOccurred(kind);
  else hf.impactOccurred(kind);
}
