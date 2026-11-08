// Retry mode helper: rebuild an exercise keeping ONLY the items the student
// got wrong in their last attempt. Item ids live under a different content
// key per task type, but every item carries `id`, so one generic filter
// covers all four types and the scoring engine never notices the difference.
import type { Exercise } from "../types";

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
  };

  const kept = pick(listKey[exercise.task_type]);
  if (!kept || kept.length === 0) return null;
  return {
    ...exercise,
    content: { ...content, [listKey[exercise.task_type]]: kept } as never,
  };
}
