// Word-form `sentence` is a group key coming from the AI: consecutive gaps
// of one textbook entry (e.g. a question + its short answer) share it. The
// model may print any numbers (even textbook page ones like 10, 12), so
// renumber groups to guaranteed sequential 1..N before rendering — this
// also fixes exercises stored before the backend started normalizing.
// Mirrors normalizeWordFormItems() in the backend; idempotent.
import type { Exercise, WordFormContent } from "../types";

export function normalizeExercise(ex: Exercise): Exercise {
  if (ex.task_type !== "word-form") return ex;
  // Exercise is not a discriminated union, so narrow via an explicit cast.
  const content = ex.content as WordFormContent;
  const items = content.items;
  if (!items.some((it) => typeof it.sentence === "number")) return ex;
  let group = 0;
  let prev: number | null = null;
  const renumbered = items.map((it) => {
    const s = it.sentence ?? null;
    if (s !== prev) group++;
    prev = s;
    return { ...it, sentence: group };
  });
  return { ...ex, content: { ...content, items: renumbered } };
}
