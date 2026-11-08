-- 002: add the 'word-form' task type (open cloze / word formation /
-- key word transformation — student types the answer, no word bank).
-- Run this once in the Supabase SQL editor.
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'word-form';
