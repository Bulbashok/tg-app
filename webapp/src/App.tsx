// Mini App root: Telegram init -> resolve exercise id -> fetch from Supabase
// -> render the dynamic task view -> "Проверить" -> score, save, notify, feedback.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useExerciseId, useTelegramInit } from "./hooks/useTelegram";
import { fetchExercise, submitResult } from "./lib/api";
import { tg, haptic } from "./lib/telegram";
import { scoreExercise, isComplete, type Answers } from "./lib/scoring";
import type { Exercise, SubmissionResult } from "./types";
import GapFill from "./components/GapFill";
import WordForm from "./components/WordForm";
import Matching from "./components/Matching";
import Sorting from "./components/Sorting";
import ResultBanner from "./components/ResultBanner";

export default function App() {
  useTelegramInit();
  const exerciseId = useExerciseId();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notified, setNotified] = useState(false);
  const [notifyError, setNotifyError] = useState(false);

  // Load exercise JSON from Supabase (anon read of the exercises table).
  useEffect(() => {
    if (!exerciseId) {
      setLoadError("Нет ссылки на упражнение (parameter ?exercise=<id>).");
      return;
    }
    fetchExercise(exerciseId)
      .then(setExercise)
      .catch((e) => setLoadError((e as Error).message));
  }, [exerciseId]);

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
    haptic(scored.correct === scored.total ? "success" : "error");

    // One backend call: verify initData -> save submission -> alert teacher.
    setSubmitting(true);
    try {
      await submitResult({
        exerciseId: exercise.id,
        initData: tg?.initData ?? "",
        score: scored.score,
        errors: scored.errors,
      });
      setNotified(true);
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
        <p className="state">Загрузка упражнения…</p>
      </div>
    );

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">{exercise.title}</h1>
        <p className="app__instruction">{exercise.instruction}</p>
      </header>

      <main className="app__body">{view}</main>

      {result && (
        <ResultBanner
          result={result}
          notified={notified}
          notifyError={notifyError}
        />
      )}

      {!revealed && (
        <button
          type="button"
          className="app__submit"
          onClick={onCheck}
          disabled={!isComplete(exercise, answers) || submitting}
        >
          {submitting ? "Отправка…" : "Проверить"}
        </button>
      )}
    </div>
  );
}
