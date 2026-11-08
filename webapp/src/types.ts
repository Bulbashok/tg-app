// Mirror of the backend content schemas (exercises.content jsonb).
export type TaskType = "gap-fill" | "matching" | "sorting" | "word-form";

export interface GapFillContent {
  passage: string;
  gaps: { id: number; answer: string }[];
  wordBank: { id: number; word: string }[];
}
export interface MatchingContent {
  pairs: { id: number; english: string; russian: string }[];
}
export interface SortingContent {
  categories: { id: string; name: string }[];
  words: { id: string; text: string; categoryId: string }[];
}
export interface WordFormItem {
  id: number;
  before: string;
  after: string;
  hint: string;
  answer: string;
  alt?: string[];
}
export interface WordFormContent {
  items: WordFormItem[];
}

export interface Exercise {
  id: string;
  title: string;
  instruction: string;
  task_type: TaskType;
  content: GapFillContent | MatchingContent | SortingContent | WordFormContent;
  created_at: string;
}

/** One wrong answer, stored in submissions.errors jsonb. */
export interface ErrorDetail {
  taskId: string | number;
  /** What was asked, as a word: English term (matching), base word
   * (word-form), card text (sorting). Gap-fill has none -> № fallback. */
  label?: string;
  your: string;
  correct: string;
}

export interface SubmissionResult {
  score: string; // "8/10"
  correct: number;
  total: number;
  errors: ErrorDetail[];
}
