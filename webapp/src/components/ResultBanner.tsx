// Score banner shown after "Check answers": neutral recap + save status.
import type { SubmissionResult } from "../types";
import { tg } from "../lib/telegram";

interface Props {
  result: SubmissionResult;
  notified: boolean;
  notifyError: boolean;
  // AI grammar notes for word-form mistakes, keyed by taskId.
  hints: { taskId: number; why: string }[] | null;
  // Reopen the exercise with only these mistakes (?retry=last). Shown only
  // after the submission is saved — the retry list reads it from the DB.
  onRetry?: () => void;
  // Re-send the SAME attempt after a failed submit, so a network blip does
  // not force the student to solve everything again.
  onResend?: () => void;
  resending?: boolean;
  // Teacher layout check (?preview=1): local score only, nothing was sent.
  preview?: boolean;
}

export default function ResultBanner({
  result,
  notified,
  notifyError,
  hints,
  onRetry,
  onResend,
  resending,
  preview,
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
      {/* The score as an editorial numeral — the number is the message. */}
      <p className="result__score">
        <span className="result__score-num">{result.correct}</span>
        <span className="result__score-of">of {result.total}</span>
      </p>
      {/* Share of correct answers as a length, not only as a tone color. */}
      <div
        className="result__bar"
        role="img"
        aria-label={`${result.correct} of ${result.total} correct`}
      >
        <span style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
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
          {onRetry && notified && (
            <button type="button" className="result__retry" onClick={onRetry}>
              🎯 Practice {result.errors.length} mistake
              {result.errors.length === 1 ? "" : "s"}
            </button>
          )}
        </>
      )}
      <p className="result__status">
        {preview
          ? "Preview only — nothing is sent or saved."
          : notified
            ? "Result saved and sent to the teacher."
            : notifyError
              ? tg?.initData
                ? "Could not save your result. Your answers are kept — tap Retry sending."
                : "Open the exercise from the button in the bot message — otherwise the result cannot be saved."
              : "Saving result…"}
      </p>
      {notifyError && !notified && onResend && (
        <button
          type="button"
          className="result__retry"
          onClick={onResend}
          disabled={resending}
        >
          {resending ? "Sending…" : "↻ Retry sending"}
        </button>
      )}
    </div>
  );
}
