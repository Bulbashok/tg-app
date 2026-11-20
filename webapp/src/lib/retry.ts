// Retry mode helper: rebuild an exercise keeping ONLY the items the student
// got wrong in their last attempt. Item ids live under a different content
// key per task type, but every item carries `id`, so one generic filter
// covers all five types and the scoring engine never notices the difference.
import type { Exercise, GapFillContent } from "../types";

export function filterExerciseToMistakes(
  exercise: Exercise,
  keep: Set<string>,
): Exercise | null {
  const content = exercise.content as unknown as Record<string, unknown>;
  const pick = (key: string): unknown[] | null => {
    const arr = content[key];
    if (!Array.isArray(arr)) return null;
    return arr.filter((item) => keep.has(String((item as { id?: unknown }).id)));
  };

  const listKey: Record<Exercise["task_type"], string> = {
    "gap-fill": "gaps",
    matching: "pairs",
    sorting: "words",
    "word-form": "items",
    choice: "items",
  };

  const kept = pick(listKey[exercise.task_type]);
  if (!kept || kept.length === 0) return null;
  const next: Record<string, unknown> = {
    ...content,
    [listKey[exercise.task_type]]: kept,
  };

  // gap-fill draws an input for EVERY ___N___ marker in the passage, so
  // filtering `gaps` alone leaves phantom inputs that can never turn green
  // (isGapCorrect finds no gap for them). Fill the already-solved markers
  // with their answers and shrink the word bank to the remaining words.
  if (exercise.task_type === "gap-fill") {
    const gaps = (content.gaps ?? []) as GapFillContent["gaps"];
    const keptIds = new Set(
      kept.map((g) => String((g as { id?: unknown }).id)),
    );
    const answerById = new Map(gaps.map((g) => [String(g.id), g.answer]));
    next.passage = String(content.passage ?? "").replace(
      /___(\d+)___/g,
      (marker, id: string) =>
        keptIds.has(id) ? marker : (answerById.get(id) ?? marker),
    );
    const bank = (content.wordBank ?? []) as GapFillContent["wordBank"];
    const keptBank = bank.filter((w) => keptIds.has(String(w.id)));
    // Bank ids normally mirror gap ids; if they do not, rebuild it from the
    // kept answers so the picker still offers exactly the needed words.
    next.wordBank = keptBank.length
      ? keptBank
      : (kept as GapFillContent["gaps"]).map((g) => ({
          id: g.id,
          word: g.answer,
        }));
  }

  return { ...exercise, content: next as never };
}
