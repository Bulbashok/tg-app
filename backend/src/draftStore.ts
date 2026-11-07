// Short-lived store of AI drafts awaiting teacher approval.
// Keyed by a random id embedded in the inline-button callback data
// (Telegram limits callback_data to 164 bytes, so we can't carry the JSON).
// Entries expire after 30 minutes; on Render restart pending drafts are lost,
// which is acceptable — the teacher simply re-sends the photo.
import { randomUUID } from 'node:crypto';
import type { ExerciseRow } from './types.js';

interface Entry {
  draft: ExerciseRow;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const TTL_MS = 30 * 60 * 1000;

export function putDraft(draft: ExerciseRow): string {
  const id = randomUUID().slice(0, 8);
  store.set(id, { draft, expiresAt: Date.now() + TTL_MS });
  return id;
}

export function getDraft(id: string): ExerciseRow | undefined {
  const entry = store.get(id);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(id);
    return undefined;
  }
  return entry.draft;
}

export function popDraft(id: string): ExerciseRow | undefined {
  const draft = getDraft(id);
  store.delete(id);
  return draft;
}
