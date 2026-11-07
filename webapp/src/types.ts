// Mirror of the backend content schemas (exercises.content jsonb).
export type TaskType = "gap-fill" | "matching" | "sorting";

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

export interface Exercise {
  id: string;
  title: string;
  instruction: string;
  task_type: TaskType;
  content: GapFillContent | MatchingContent | SortingContent;
  created_at: string;
}

/** One wrong answer, stored in submissions.errors jsonb. */
export interface ErrorDetail {
  taskId: string | number;
  your: string;
  correct: string;
}

export interface SubmissionResult {
  score: string; // "8/10"
  correct: number;
  total: number;
  errors: ErrorDetail[];
}
