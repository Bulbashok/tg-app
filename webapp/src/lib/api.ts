// Data-access helpers: read the exercise from Supabase, submit results to
// the backend (which verifies initData, writes DB rows and alerts the teacher).
import { getSupabase } from "./supabase";
import type { Exercise } from "../types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;

export async function fetchExercise(id: string): Promise<Exercise> {
  const { data, error } = await getSupabase()
    .from("exercises")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  if (!data) throw new Error("Exercise not found. Check the link.");
  return data as Exercise;
}

export async function submitResult(payload: {
  exerciseId: string;
  initData: string; // raw signed string — the backend HMAC-verifies it
  score: string;
  errors: unknown[];
}): Promise<{ hints?: { taskId: number; why: string }[] | null }> {
  const res = await fetch(`${BACKEND_URL}/api/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tg-init-data": payload.initData,
    },
    body: JSON.stringify({
      exerciseId: payload.exerciseId,
      score: payload.score,
      errors: payload.errors,
    }),
  });
  if (!res.ok) throw new Error(`Submit failed (${res.status})`);
  // { ok, hints } — hints are AI grammar notes for word-form mistakes;
  // null/absent for other task types and on older backends.
  try {
    return (await res.json()) as {
      hints?: { taskId: number; why: string }[] | null;
    };
  } catch {
    return {};
  }
}

/**
 * Retry mode: task ids of the student's latest attempt mistakes.
 * null  -> no previous attempt (or backend too old) — open the full exercise.
 * []    -> the last attempt was perfect — nothing to practice.
 * The backend HMAC-verifies initData, so a student only ever reads their own.
 */
export async function fetchLastMistakes(
  exerciseId: string,
  initData: string,
): Promise<{ taskId: string }[] | null> {
  const res = await fetch(
    `${BACKEND_URL}/api/last-mistakes?exercise=${encodeURIComponent(exerciseId)}`,
    { headers: { "x-tg-init-data": initData } },
  );
  if (!res.ok) throw new Error(`Last-mistakes fetch failed (${res.status})`);
  const data = (await res.json()) as {
    errors?: { taskId: string }[] | null;
  };
  return data.errors ?? null;
}
