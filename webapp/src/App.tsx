// Mini App root: Telegram init -> resolve exercise id -> fetch from Supabase
// -> render the dynamic task view -> "Check answers" -> score, save, notify, feedback.
// Dev-only ?mock=<task_type> mode renders bundled exercises without any backend.
// ?preview=1 lets the teacher inspect the layout: scoring stays local, nothing
// is submitted and no submission row is written.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useExerciseId, useTelegramInit } from "./hooks/useTelegram";
import { fetchExercise, submitResult, fetchLastMistakes } from "./lib/api";
import { tg, haptic } from "./lib/telegram";
import {
  scoreExercise,
  isComplete,
  answerProgress,
  type Answers,
} from "./lib/scoring";
import { filterExerciseToMistakes } from "./lib/retry";
import { normalizeExercise } from "./lib/normalize";
import { loadPending, savePending, clearPending } from "./lib/offline";
import { MOCK_EXERCISES, mockKeyFromUrl } from "./dev/mocks";
import type { Exercise, SubmissionResult } from "./types";
import GapFill from "./components/GapFill";
import WordForm from "./components/WordForm";
import Matching from "./components/Matching";
import Sorting from "./components/Sorting";
import ResultBanner from "./components/ResultBanner";

const params = () => new URLSearchParams(window.location.search);

// Living light field behind the glass: three drifting chroma blobs + grain.
// Purely decorative, fixed, transform-only animation (see _base.scss).
function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="ambient__blob ambient__blob--1" />
      <span className="ambient__blob ambient__blob--2" />
      <span className="ambient__blob ambient__blob--3" />
    </div>
  );
}

export default function App() {
  useTelegramInit();
  const exerciseId = useExerciseId();
  // Mock mode works only in `npm run dev` builds; tree-shaken from prod.
  const mockKey = import.meta.env.DEV ? mockKeyFromUrl() : null;
  // ?retry=last — reopen the exercise with only the last attempt mistakes.
  const retryLast = !mockKey && params().get("retry") === "last";
  // ?preview=1 — teacher layout check: local scoring only, never submitted.
  const previewMode = !mockKey && params().get("preview") === "1";

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by "Try again" so a failed load is recoverable without a reload.
  const [loadTick, setLoadTick] = useState(0);
  // Cold start / slow link: say what is happening instead of a silent wait.
  const [slowLoad, setSlowLoad] = useState(false);
  const [slowSend, setSlowSend] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notified, setNotified] = useState(false);
  const [notifyError, setNotifyError] = useState(false);
  // AI grammar hints for word-form mistakes, returned by /api/submit.
  const [hints, setHints] = useState<{ taskId: number; why: string }[] | null>(
    null,
  );
  // Retry mode: chip text under the title, or the "nothing to practice" state.
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [retryEmpty, setRetryEmpty] = useState(false);
  // Score of the previous attempt, shown as a chip on a normal open.
  const [lastScore, setLastScore] = useState<string | null>(null);
  // Bumped by "Reset answers": remounts the task view so local drag layout
  // (sorting lists, matching selection) is rebuilt from the content too.
  const [resetTick, setResetTick] = useState(0);
  // A previous send that never reached the backend, kept across reloads.
  const [pending, setPending] = useState<SubmissionResult | null>(null);

  // Load exercise JSON from Supabase (anon read of the exercises table),
  // or straight from the bundled mocks in dev ?mock= mode.
  useEffect(() => {
    if (mockKey) {
      // Same load-time repair path as real rows, so fixtures can carry raw
      // AI-style defects and prove the sanitizer catches them.
      setExercise(
        normalizeExercise(
          MOCK_EXERCISES.find((e) => e.task_type === mockKey) ??
            MOCK_EXERCISES[0],
        ),
      );
      return;
    }
    if (!exerciseId) {
      setLoadError(
        "Exercise not found. Open the exercise from the link in the bot message.",
      );
      return;
    }
    setPending(loadPending(exerciseId));
    const slowTimer = setTimeout(() => setSlowLoad(true), 5_000);
    fetchExercise(exerciseId)
      .then(async (fetched) => {
        // Entry-group numbering is a contract the renderer relies on, so
        // normalize even stored rows parsed before the backend did it.
        const ex = normalizeExercise(fetched);
        // One history call serves both modes: the retry filter and the
        // "last attempt" chip. Any failure degrades to the full exercise.
        let history: {
          errors: { taskId: string }[] | null;
          score: string | null;
        } | null = null;
        if (retryLast || tg?.initData) {
          try {
            history = await fetchLastMistakes(exerciseId, tg?.initData ?? "");
          } catch {
            history = null;
          }
        }
        setLastScore(history?.score ?? null);
        if (!retryLast) return setExercise(ex);
        const list = history?.errors ?? null;
        if (!list) return setExercise(ex);
        if (!list.length) {
          setRetryEmpty(true);
          return;
        }
        const filtered = filterExerciseToMistakes(
          ex,
          new Set(list.map((m) => m.taskId)),
        );
        if (!filtered) {
          setRetryEmpty(true);
          return;
        }
        setRetryNote(
          `Practicing ${list.length} mistake${list.length > 1 ? "s" : ""} from your last attempt`,
        );
        setExercise(filtered);
      })
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => {
        clearTimeout(slowTimer);
        setSlowLoad(false);
      });
  }, [exerciseId, mockKey, retryLast, loadTick]);

  // Stable identity for answer updates passed into task components.
  const setAnswer = useCallback(
    (key: string, value: string) =>
      setAnswers((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const revealed = result !== null;
  const progress = useMemo(
    () =>
      exercise
        ? answerProgress(exercise, answers)
        : { answered: 0, total: 0 },
    [exercise, answers],
  );

  // Send an already-scored attempt. Kept separate from onCheck so a failed
  // send can be retried without solving the exercise again — the score and
  // the mistake list are already in state (and in localStorage).
  const sendResult = useCallback(
    async (scored: SubmissionResult) => {
      if (!exercise || mockKey || previewMode) return;
      setSubmitting(true);
      setNotifyError(false);
      const slowTimer = setTimeout(() => setSlowSend(true), 5_000);
      try {
        const out = await submitResult({
          exerciseId: exercise.id,
          initData: tg?.initData ?? "",
          score: scored.score,
          errors: scored.errors,
        });
        setNotified(true);
        setHints(out.hints ?? null);
        clearPending(exercise.id);
        setPending(null);
      } catch {
        setNotifyError(true);
        // Survives a reload; offered again as "Send saved result".
        savePending(exercise.id, scored);
        setPending(scored);
      } finally {
        clearTimeout(slowTimer);
        setSlowSend(false);
        setSubmitting(false);
      }
    },
    [exercise, mockKey, previewMode],
  );

  // Coming back online is the moment a queued result can actually go out.
  useEffect(() => {
    const onOnline = () => {
      if (pending && !submitting) void sendResult(pending);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [pending, submitting, sendResult]);

  const onCheck = async () => {
    if (!exercise) return;
    const scored = scoreExercise(exercise, answers);
    setResult(scored);
    setHints(null);
    haptic(scored.correct === scored.total ? "success" : "error");

    // Preview: the teacher sees the real result layout, nothing is sent.
    if (previewMode) return;

    // One backend call: verify initData -> save submission -> alert teacher.
    // Skipped entirely in mock mode — UI-only iteration, nothing is sent.
    if (mockKey) {
      setNotified(true);
      // Static stand-ins so the hint layout is previewable offline: shown
      // only for word-form, attached to the first two actual mock mistakes.
      if (exercise.task_type === "word-form" && scored.errors.length) {
        const samples = [
          "Visible evidence now points to a planned future — use 'going to', not present continuous.",
          "A finished past time marker requires past simple passive, not present perfect.",
        ];
        setHints(
          scored.errors.slice(0, 2).map((e, i) => ({
            taskId: Number(e.taskId),
            why: samples[i % samples.length],
          })),
        );
      }
      return;
    }
    await sendResult(scored);
  };

  const resetAnswers = () => {
    setAnswers({});
    setResetTick((t) => t + 1);
    haptic("selection");
  };

  const retryLoad = () => {
    setLoadError(null);
    setExercise(null);
    setRetryEmpty(false);
    setLoadTick((t) => t + 1);
  };

  const view = useMemo(() => {
    if (!exercise) return null;
    const props = { answers, revealed, onChange: setAnswer };
    switch (exercise.task_type) {
      case "gap-fill":
        return <GapFill content={exercise.content as never} {...props} />;
      case "matching":
        return <Matching content={exercise.content as never} {...props} />;
      case "sorting":
        return <Sorting content={exercise.content as never} {...props} />;
      case "word-form":
        return <WordForm content={exercise.content as never} {...props} />;
    }
  }, [exercise, answers, revealed, setAnswer]);

  if (loadError)
    return (
      <div className="app">
        <Ambient />
        <p className="state state--error">{loadError}</p>
        <button type="button" className="state__btn" onClick={retryLoad}>
          Try again
        </button>
      </div>
    );
  if (!exercise)
    return (
      <div className="app">
        <Ambient />
        {/* Shape of the task to come: a cold start can take ~30 s, and a bare
            line of text reads as a broken page for that whole wait. */}
        <div className="skeleton" aria-hidden="true">
          <span className="skeleton__line skeleton__line--title" />
          <span className="skeleton__line" />
          <span className="skeleton__block" />
          <span className="skeleton__line" />
          <span className="skeleton__block skeleton__block--short" />
        </div>
        <p className="state">
          {slowLoad
            ? "Waking the server — this can take about 30 s…"
            : "Loading exercise…"}
        </p>
      </div>
    );

  // Opened ?retry=last but the last attempt had no (remaining) mistakes.
  if (retryEmpty)
    return (
      <div className="app">
        <Ambient />
        <p className="state">
          All answers were correct on your last attempt — nothing to practice.
        </p>
        <a className="state state--link" href={`?exercise=${exerciseId}`}>
          Open the full exercise
        </a>
      </div>
    );

  const pct = progress.total
    ? Math.round((progress.answered / progress.total) * 100)
    : 0;

  return (
    <div className="app">
      <Ambient />
      {mockKey && (
        <nav className="mock-nav">
          <b>mock UI</b>
          {MOCK_EXERCISES.map((e) => (
            <a
              key={e.id}
              href={`?mock=${e.task_type}`}
              className={e.task_type === mockKey ? "is-active" : ""}
            >
              {e.task_type}
            </a>
          ))}
        </nav>
      )}
      <header className="app__header">
        <div className="app__title-row">
          <h1 className="app__title">{exercise.title}</h1>
          <span className="app__tag">
            {exercise.task_type.replace("-", " ")}
          </span>
        </div>
        <p className="app__instruction">{exercise.instruction}</p>
        {retryNote && <p className="app__retry-note">🎯 {retryNote}</p>}
        {previewMode && (
          <p className="app__retry-note">Preview — nothing is sent or saved</p>
        )}
        {lastScore && !retryNote && (
          <p className="app__last">Last attempt: {lastScore}</p>
        )}
      </header>

      <main className="app__body" key={resetTick}>
        {view}
      </main>

      {result && (
        <ResultBanner
          result={result}
          notified={notified}
          notifyError={notifyError}
          hints={hints}
          preview={previewMode}
          resending={submitting}
          onResend={
            mockKey || previewMode ? undefined : () => sendResult(result)
          }
          onRetry={
            mockKey || previewMode
              ? undefined
              : () =>
                  window.location.assign(
                    `?exercise=${exerciseId}&retry=last`,
                  )
          }
        />
      )}

      {!revealed && (
        <>
          <div className="app__progress">
            <span className="app__progress-label">
              Answered {progress.answered} of {progress.total}
            </span>
            <span className="app__progress-track">
              <span
                className="app__progress-fill"
                style={{ width: `${pct}%` }}
              />
            </span>
            {/* Always in flow (hidden, not removed) so the track width
                never jumps when the first answer lands. */}
            <button
              type="button"
              className={`app__reset${progress.answered ? "" : " is-hidden"}`}
              onClick={resetAnswers}
              tabIndex={progress.answered ? 0 : -1}
              aria-hidden={progress.answered === 0}
            >
              Reset answers
            </button>
          </div>

          {pending && !mockKey && !previewMode && (
            <button
              type="button"
              className="app__pending"
              onClick={() => sendResult(pending)}
              disabled={submitting}
            >
              {submitting
                ? "Sending…"
                : `Send saved result (${pending.score})`}
            </button>
          )}

          <button
            type="button"
            className="app__submit"
            onClick={onCheck}
            disabled={!isComplete(exercise, answers) || submitting}
          >
            {submitting ? (
              <span className="app__saving">
                {slowSend ? "Waking the server" : "Saving"}
                <span className="app__dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            ) : previewMode ? (
              "Check answers (preview)"
            ) : (
              "Check answers"
            )}
          </button>
        </>
      )}
    </div>
  );
}