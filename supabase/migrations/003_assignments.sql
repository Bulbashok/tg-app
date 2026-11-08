-- ============================================================================
-- Migration 003: assignments — teacher assigns published exercises to
-- students; drives the student "My exercises" dashboard in the bot.
-- Run in the Supabase SQL editor (or `supabase db push`).
-- ============================================================================

create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  student_id  uuid not null references public.students(id)  on delete cascade,
  assigned_at timestamptz not null default now(),
  -- one assignment per exercise+student; re-tapping the button is a no-op
  unique (exercise_id, student_id)
);

create index assignments_student_idx on public.assignments (student_id);

-- Service-role only: every read/write goes through the bot backend.
-- With RLS enabled and no anon policies, client keys see nothing here.
alter table public.assignments enable row level security;
