// Mini App root: Telegram init -> resolve exercise id -> fetch from Supabase
// -> render the dynamic task view -> "Check answers" -> score, save, notify, feedback.
// Dev-only ?mock=<task_type> mode renders bundled exercises without any backend.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useExerciseId, useTelegramInit } from "./hooks/useTelegram";
import { fetchExercise, submitResult, fetchLastMistakes } from "./lib/api";
import { tg, haptic } from "./lib/telegram";
import { scoreExercise, isComplete, type Answers } from "./lib/scoring";
import { filterExerciseToMistakes } from "./lib/retry";
import { normalizeExercise } from "./lib/normalize";
import { MOCK_EXERCISES, mockKeyFromUrl } from "./dev/mocks";
import type { Exercise, SubmissionResult } from "./types";
import GapFill from "./components/GapFill";
import WordForm from "./components/WordForm";
import Matching from "./components/Matching";
import Sorting from "./components/Sorting";
import ResultBanner from "./components/ResultBanner";

export default function App() {
  useTelegramInit();
  const exerciseId = useExerciseId();
  // Mock mode works only in `npm run dev` builds; tree-shaken from prod.
  const mockKey = import.meta.env.DEV ? mockKeyFromUrl() : null;
  // ?retry=last — reopen the exercise with only the last attempt mistakes.
  const retryLast =
    !mockKey &&
    new URLSearchParams(window.location.search).get("retry") === "last";

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Load exercise JSON from Supabase (anon read of the exercises table),
  // or straight from the bundled mocks in dev ?mock= mode.
  useEffect(() => {
    if (mockKey) {
      setExercise(
        MOCK_EXERCISES.find((e) => e.task_type === mockKey) ??
          MOCK_EXERCISES[0],
      );
      return;
    }
    if (!exerciseId) {
      setLoadError(
        "Exercise not found. Open the exercise from the link in the bot message.",
      );
      return;
    }
    fetchExercise(exerciseId)
      .then(async (fetched) => {
        // Entry-group numbering is a contract the renderer relies on, so
        // normalize even stored rows parsed before the backend did it.
        const ex = normalizeExercise(fetched);
        if (!retryLast) return setExercise(ex);
        // Retry mode: filter to the last attempt mistakes. Any failure
        // (no history, network) degrades to the full exercise — the
        // student can always solve it as usual.
        let list: { taskId: string }[] | null = null;
        try {
          list = await fetchLastMistakes(exerciseId, tg?.initData ?? "");
        } catch {
          list = null;
        }
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
      .catch((e) => setLoadError((e as Error).message));
  }, [exerciseId, mockKey, retryLast]);

  // Stable identity for answer updates passed into task components.
  const setAnswer = useCallback(
    (key: string, value: string) =>
      setAnswers((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const revealed = result !== null;

  const onCheck = async () => {
    if (!exercise) return;
    const scored = scoreExercise(exercise, answers);
    setResult(scored);
    setHints(null);
    haptic(scored.correct === scored.total ? "success" : "error");

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
    setSubmitting(true);
    try {
      const out = await submitResult({
        exerciseId: exercise.id,
        initData: tg?.initData ?? "",
        score: scored.score,
        errors: scored.errors,
      });
      setNotified(true);
      setHints(out.hints ?? null);
    } catch {
      setNotifyError(true);
    } finally {
      setSubmitting(false);
    }
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
        <p className="state state--error">{loadError}</p>
      </div>
    );
  if (!exercise)
    return (
      <div className="app">
        <p className="state">Loading exercise…</p>
      </div>
    );

  // Opened ?retry=last but the last attempt had no (remaining) mistakes.
  if (retryEmpty)
    return (
      <div className="app">
        <p className="state">
          All answers were correct on your last attempt — nothing to practice.
        </p>
        <a className="state state--link" href={`?exercise=${exerciseId}`}>
          Open the full exercise
        </a>
      </div>
    );

  return (
    <div className="app">
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
        <h1 className="app__title">{exercise.title}</h1>
        <p className="app__instruction">{exercise.instruction}</p>
        {retryNote && <p className="app__retry-note">🎯 {retryNote}</p>}
      </header>

      <main className="app__body">{view}</main>

      {result && (
        <ResultBanner
          result={result}
          notified={notified}
          notifyError={notifyError}
          hints={hints}
          onRetry={
            mockKey
              ? undefined
              : () =>
                  window.location.assign(
                    `?exercise=${exerciseId}&retry=last`,
                  )
          }
        />
      )}

      {!revealed && (
        <button
          type="button"
          className="app__submit"
          onClick={onCheck}
          disabled={!isComplete(exercise, answers) || submitting}
        >
          {submitting ? "Saving…" : "Check answers"}
        </button>
      )}
    </div>
  );
}
