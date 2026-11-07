// Central, task-type-agnostic scoring engine.
// Every interactive element writes into one flat answer map:
//   gap-fill : answers["gap-<id>"]     = typed/selected word
//   matching : answers["en-<pairId>"]  = chosen russian item id
//   sorting  : answers["word-<id>"]    = chosen category id
// This lets App.tsx score any exercise uniformly and produce
// submissions.errors details for the teacher.
import type {
  Exercise,
  GapFillContent,
  MatchingContent,
  SortingContent,
  SubmissionResult,
  ErrorDetail,
} from "../types";

export type Answers = Record<string, string>;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function scoreExercise(
  exercise: Exercise,
  answers: Answers,
): SubmissionResult {
  const errors: ErrorDetail[] = [];
  let correct = 0;
  let total = 0;

  switch (exercise.task_type) {
    case "gap-fill": {
      const c = exercise.content as GapFillContent;
      for (const gap of c.gaps) {
        total++;
        const your = answers[`gap-${gap.id}`] ?? "";
        if (norm(your) === norm(gap.answer)) correct++;
        else
          errors.push({
            taskId: gap.id,
            your: your || "—",
            correct: gap.answer,
          });
      }
      break;
    }
    case "matching": {
      const c = exercise.content as MatchingContent;
      for (const pair of c.pairs) {
        total++;
        const chosen = answers[`en-${pair.id}`]; // russian item id
        const yourLabel =
          c.pairs.find((p) => String(p.id) === chosen)?.russian ?? "—";
        if (chosen === String(pair.id)) correct++;
        else
          errors.push({
            taskId: pair.id,
            your: yourLabel,
            correct: pair.russian,
          });
      }
      break;
    }
    case "sorting": {
      const c = exercise.content as SortingContent;
      const catName = (id?: string) =>
        c.categories.find((k) => k.id === id)?.name ?? "—";
      for (const word of c.words) {
        total++;
        const chosen = answers[`word-${word.id}`];
        if (chosen === word.categoryId) correct++;
        else
          errors.push({
            taskId: word.id,
            your: catName(chosen),
            correct: catName(word.categoryId),
          });
      }
      break;
    }
  }

  return { score: `${correct}/${total}`, correct, total, errors };
}

/** True once the student answered every scorable item (enables the button). */
export function isComplete(exercise: Exercise, answers: Answers): boolean {
  const ids: string[] = [];
  if (exercise.task_type === "gap-fill")
    (exercise.content as GapFillContent).gaps.forEach((g) =>
      ids.push(`gap-${g.id}`),
    );
  if (exercise.task_type === "matching")
    (exercise.content as MatchingContent).pairs.forEach((p) =>
      ids.push(`en-${p.id}`),
    );
  if (exercise.task_type === "sorting")
    (exercise.content as SortingContent).words.forEach((w) =>
      ids.push(`word-${w.id}`),
    );
  return ids.every((id) => (answers[id] ?? "").length > 0);
}
