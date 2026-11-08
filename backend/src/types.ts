// Zod schemas enforce the strict JSON contract we expect from Groq
// and mirror the TypeScript types used by the React Mini App.
import { z } from "zod";

export const taskTypeEnum = z.enum([
  "gap-fill",
  "matching",
  "sorting",
  "word-form",
]);
export type TaskType = z.infer<typeof taskTypeEnum>;

// ---------------------------------------------------------------------------
// Per-type content shapes (stored in exercises.content jsonb)
// ---------------------------------------------------------------------------
export const gapFillSchema = z.object({
  // Passage with numbered gap markers, e.g. "She ___1___ to school daily."
  passage: z.string().min(1),
  gaps: z.array(z.object({ id: z.number(), answer: z.string().min(1) })).min(1),
  wordBank: z
    .array(z.object({ id: z.number(), word: z.string().min(1) }))
    .min(1),
});

export const matchingSchema = z.object({
  pairs: z
    .array(
      z.object({
        id: z.number(),
        english: z.string().min(1),
        russian: z.string().min(1),
      }),
    )
    .min(2),
});

export const sortingSchema = z.object({
  categories: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
    .min(2),
  words: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        categoryId: z.string().min(1),
      }),
    )
    .min(2),
});

// "word-form": open cloze / word formation / key word transformation.
// Each item is one sentence split around a blank the student types into;
// `hint` is the bracketed/given base word, `answer` the expected form
// (may be several words), `alt` optional accepted alternatives.
export const wordFormSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.number(),
        // Number of the textbook ENTRY this blank belongs to: one entry may
        // hold several sentences (a question + its answer), their gaps share
        // it. Renumbered to sequential 1..N by normalizeWordFormItems.
        sentence: z.number().optional(),
        // May be empty when the blank sits at the very start of the sentence
        // ("______ (hurt) badly in the past, she found…").
        before: z.string(),
        after: z.string().default(""),
        hint: z.string().min(1),
        answer: z.string().min(1),
        alt: z.array(z.string().min(1)).optional(),
      }),
    )
    .min(1),
});

export const exerciseDraftSchema = z.object({
  title: z.string().min(1).max(120),
  instruction: z.string().min(1).max(500),
  task_type: taskTypeEnum,
  content: z.unknown(), // validated below, once task_type is known
});

export type GapFillContent = z.infer<typeof gapFillSchema>;
export type MatchingContent = z.infer<typeof matchingSchema>;
export type SortingContent = z.infer<typeof sortingSchema>;
export type WordFormContent = z.infer<typeof wordFormSchema>;

export interface ExerciseRow {
  id: string;
  title: string;
  instruction: string;
  task_type: TaskType;
  content: GapFillContent | MatchingContent | SortingContent | WordFormContent;
  created_at: string;
}

/**
 * Word-form items may carry a `sentence` group key from the model. Turn it
 * into guaranteed sequential exercise numbers 1..N: consecutive items with
 * the same value merge into one entry, every new value opens the next one.
 * Absolute numbers don't matter — only equality/changes between neighbours.
 * Idempotent, so stored rows normalize the same way on every read path.
 */
export function normalizeWordFormItems(
  items: { sentence?: number }[],
): void {
  if (!items.some((it) => typeof it.sentence === "number")) return;
  let group = 0;
  let prev: number | null = null;
  for (const it of items) {
    const s = it.sentence ?? null;
    if (s !== prev) group++;
    it.sentence = group;
    prev = s;
  }
}

/** Validate an AI-produced draft; throws with a readable reason on failure. */
export function parseExerciseDraft(raw: unknown): ExerciseRow {
  const base = exerciseDraftSchema.parse(raw) as {
    title: string;
    instruction: string;
    task_type: TaskType;
    content: unknown;
  };
  const contentSchema = {
    "gap-fill": gapFillSchema,
    matching: matchingSchema,
    sorting: sortingSchema,
    "word-form": wordFormSchema,
  }[base.task_type];
  const content = contentSchema.parse(base.content) as ExerciseRow["content"];
  if (base.task_type === "word-form") {
    normalizeWordFormItems((content as WordFormContent).items);
  }
  return { ...base, content, id: "", created_at: "" }; // id assigned by Postgres on insert
}
