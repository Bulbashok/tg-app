// One unsent submission per exercise, kept in localStorage so a failed send
// (sleeping backend, lost network) survives a reload. Retried explicitly via
// the "Send saved result" button or automatically on the browser's `online`
// event — never silently on open, so a send that actually reached the server
// can't be duplicated without the student seeing it happen.
import type { ErrorDetail } from "../types";

export interface PendingResult {
  score: string;
  correct: number;
  total: number;
  errors: ErrorDetail[];
}

const key = (exerciseId: string) => `tg-pending-${exerciseId}`;

export function loadPending(exerciseId: string): PendingResult | null {
  try {
    const raw = localStorage.getItem(key(exerciseId));
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingResult;
    return typeof p?.score === "string" && Array.isArray(p.errors) ? p : null;
  } catch {
    return null;
  }
}

export function savePending(exerciseId: string, p: PendingResult): void {
  try {
    localStorage.setItem(key(exerciseId), JSON.stringify(p));
  } catch {
    // Quota or private mode — the in-memory Retry button still works.
  }
}

export function clearPending(exerciseId: string): void {
  try {
    localStorage.removeItem(key(exerciseId));
  } catch {
    // Ignore.
  }
}