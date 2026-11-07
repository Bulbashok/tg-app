-- ============================================================================
-- English Exercises – Supabase schema (migration 001)
-- Run with: supabase db push   (or paste into the Supabase SQL editor)
-- ============================================================================

create extension if not exists "pgcrypto";

-- Task type enum -------------------------------------------------------------
create type public.task_type as enum ('gap-fill', 'matching', 'sorting');

-- ---------------------------------------------------------------------------
-- exercises: parsed textbook tasks (created by the bot after teacher approval)
-- ---------------------------------------------------------------------------
create table public.exercises (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  instruction text not null,
  task_type   public.task_type not null,
  -- Shape of `content` depends on task_type (validated by the bot via zod):
  --  gap-fill : { passage, gaps:[{id,answer}], wordBank:[{id,word}] }
  --  matching : { pairs:[{id, english, russian}] }
  --  sorting  : { categories:[{id,name}], words:[{id,text,categoryId}] }
  content     jsonb not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- students: one row per Telegram user who opens a Mini App
-- ---------------------------------------------------------------------------
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- submissions: student attempts with score and per-error details
-- ---------------------------------------------------------------------------
create table public.submissions (
  id           uuid primary key default gen_random_uuid(),
  exercise_id  uuid not null references public.exercises(id) on delete cascade,
  student_id   uuid not null references public.students(id)   on delete cascade,
  score        text not null,                 -- human readable, e.g. "8/10"
  errors       jsonb not null default '[]'::jsonb, -- [{taskId, your, correct}]
  submitted_at timestamptz not null default now()
);

create index submissions_exercise_idx on public.submissions (exercise_id);
create index submissions_student_idx  on public.submissions (student_id);

-- ============================================================================
-- Row Level Security
-- The Mini App uses the ANON key only, and it needs exactly ONE permission:
-- read exercises. Every write (students, submissions) goes through the bot
-- backend, which connects with the service_role key that BYPASSES RLS.
-- This means a student can never forge or over-write data via the anon key.
-- ============================================================================
alter table public.exercises   enable row level security;
alter table public.students    enable row level security;
alter table public.submissions enable row level security;

-- Students may read exercises (the app fetches one by uuid).
create policy "exercises are readable by everyone"
  on public.exercises for select
  using (true);

-- No anon policies on students/submissions on purpose: those tables are only
-- ever touched by the service_role backend. With RLS enabled and no matching
-- policy, anon/web requests are denied by default.

-- ============================================================================
-- Storage: bucket for textbook screenshots
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('textbook-images', 'textbook-images', true)
on conflict (id) do nothing;

-- Public read so the Groq vision API can fetch the image by URL.
create policy "textbook images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'textbook-images');

-- Only the bot backend (service_role) uploads; anon cannot write to storage.
-- service_role bypasses policies, so no explicit insert policy is needed.
