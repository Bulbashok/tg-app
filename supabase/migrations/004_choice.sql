-- 004: add the 'choice' task type ("circle the correct answer" — each
-- sentence prints its alternatives inline; the student taps one).
-- Run this once in the Supabase SQL editor BEFORE deploying code that
-- inserts exercises with task_type = 'choice'.
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'choice';