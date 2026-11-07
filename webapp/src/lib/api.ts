// Data-access helpers: read the exercise from Supabase, submit results to
// the backend (which verifies initData, writes DB rows and alerts the teacher).
import { supabase } from "./supabase";
import type { Exercise } from "../types";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;

export async function fetchExercise(id: string): Promise<Exercise> {
  const { data, error } = await supabase
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
}): Promise<void> {
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
}
