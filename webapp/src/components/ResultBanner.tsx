// Score banner shown after "Check answers": neutral recap + save status.
import type { SubmissionResult } from "../types";
import { tg } from "../lib/telegram";

interface Props {
  result: SubmissionResult;
  notified: boolean;
  notifyError: boolean;
  // AI grammar notes for word-form mistakes, keyed by taskId.
  hints: { taskId: number; why: string }[] | null;
}

export default function ResultBanner({
  result,
  notified,
  notifyError,
  hints,
}: Props) {
  const pct = result.total ? result.correct / result.total : 0;
  const tone = pct === 1 ? "perfect" : pct >= 0.6 ? "good" : "bad";
  const headline =
    pct === 1
      ? "All answers are correct."
      : pct >= 0.6
        ? "Some answers are incorrect."
        : "Many answers are incorrect.";

  const whyFor = (taskId: string | number) =>
    hints?.find((h) => String(h.taskId) === String(taskId))?.why ?? null;

  return (
    <div className={`result result--${tone}`}>
      <p className="result__headline">{headline}</p>
      <p className="result__score">
        Result: {result.correct} of {result.total}
      </p>
      {result.errors.length > 0 && (
        <>
          <p className="result__errors-title">Mistakes</p>
          <ul className="result__errors">
            {result.errors.map((e, i) => (
              <li key={i}>
                {e.label ? `«${e.label}»` : `№${e.taskId}`}: «{e.your}» →
                correct: «{e.correct}»
                {whyFor(e.taskId) && (
                  <p className="result__why">{whyFor(e.taskId)}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="result__status">
        {notified
          ? "Result saved and sent to the teacher."
          : notifyError
            ? tg?.initData
              ? "Could not save your result. Check the connection and try again."
              : "Open the exercise from the button in the bot message — otherwise the result cannot be saved."
            : "Saving result…"}
      </p>
    </div>
  );
}
