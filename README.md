# 🎓 English Textbook → Interactive Telegram Mini App

A private, non-commercial ecosystem for an English teacher:

> Teacher sends a **textbook screenshot** to the bot → **Qwen3.8-27B vision** (via Groq,
> OpenAI-compatible) parses it into a
> structured exercise → teacher approves → bot publishes a **Telegram Mini App link** →
> students complete it interactively → scores land back in the teacher's Telegram chat.

**Stack:** React + Vite + TypeScript + SCSS + `@hello-pangea/dnd` (Vercel) · Node + TypeScript +
grammY + Express + AI-vision (OpenRouter/Groq/any OpenAI-compatible) + Supabase (Render) ·
Supabase Postgres + Storage.

```
tg-app/
├─ supabase/migrations/001_schema.sql   # tables, enum, RLS, storage bucket
├─ backend/                             # Telegram bot + webhook server (Render)
│  └─ src/{env,types,supabase,storage,ai,preview,draftStore,telegramAuth,bot,server}.ts
├─ webapp/                              # React Mini App (Vercel)
│  └─ src/{App,main}.tsx  lib/{api,supabase,scoring,telegram,utils}.ts
│     components/{GapFill,Matching,Sorting,ResultBanner}.tsx  styles/*.scss
└─ render.yaml
```

---

## 1. Supabase

```bash
supabase init            # once
supabase link --project-ref <your-ref>
supabase db push         # applies supabase/migrations/001_schema.sql
```

Or paste `001_schema.sql` into the SQL editor. Creates `exercises`, `students`, `submissions`,
the `task_type` enum, RLS policies, and the public `textbook-images` storage bucket.

## 2. Backend bot (Render)

```bash
cd backend
cp .env.example .env      # fill in real secrets
npm install
npm run dev               # local
```

Deploy: push the repo to GitHub → Render **Blueprint** (reads `render.yaml`) or a **Web** service
with Root Dir `backend`, Build `npm install && npm run build`, Start `npm start`, Health `/health`.

**Flow:** image (teacher-only; photos and image-documents accepted) → `storage.ts` uploads to
Supabase → `ai.ts` returns strict JSON → validated by `types.ts` → `preview.ts` renders approval
text → ✅/❌ inline buttons (`bot.ts`) →
on confirm inserts into `exercises` and posts the Mini App link. `server.ts` also exposes
`POST /api/submit`, which HMAC-verifies the student's Telegram `initData`
(`telegramAuth.ts`), writes `submissions` + `students` with the service role, and DMs the teacher.

## 3. Web App (Vercel)

```bash
cd webapp
cp .env.example .env      # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_BACKEND_URL
npm install
npm run dev
npm run build             # production → dist/
```

Deploy to Vercel (framework **Vite**, output `dist`). Then in **BotFather**:
`/newapp` (or _Set Menu Button URL_) pointing at the Vercel domain so `t.me` links open in-app.

**Exercise link format:**
`https://<webapp>/?exercise=<uuid>` or deep link `https://t.me/<bot>/<app>?startapp=ex_<uuid>`
(the app reads `start_param` first, then the `?exercise` query).

---

## Security model

| Secret                                                          | Where it lives                         | Reachable by students?                       |
| --------------------------------------------------------------- | -------------------------------------- | -------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY` | backend `.env` only                    | ❌ no                                        |
| `SUPABASE_ANON_KEY`                                             | webapp bundle                          | ✅ (by design) but RLS = read exercises only |
| Student identity                                                | signed `initData` verified server-side | ✅ trusted after HMAC check                  |

- Teacher-only ingestion via `TELEGRAM_TEACHER_ID`.
- All writes go through the backend (service role bypasses RLS); the anon key can only **read**
  `exercises`. No client secret is ever shipped.
- AI output is schema-validated (zod) before it can reach the database.

> ℹ️ Provider is configurable via `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` (default:
> Groq + `qwen/qwen3.8-27b`, Groq's current vision model — the Llama vision models were
> removed; `meta-llama/llama-4-scout` is no longer on Groq). OpenRouter works as a fallback
> provider for local dev from geo-blocked IPs.

## Local dev note

The Mini App runs in any browser tab using `?exercise=<uuid>` (Telegram SDK features just no-op).
Point `VITE_BACKEND_URL` at `http://localhost:3000` while the backend runs.
