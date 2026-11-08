// Score banner shown after "Проверить": score, per-error recap, teacher alert status.
import type { SubmissionResult } from "../types";
import { tg } from "../lib/telegram";

interface Props {
  result: SubmissionResult;
  notified: boolean;
  notifyError: boolean;
}

export default function ResultBanner({ result, notified, notifyError }: Props) {
  const pct = result.total ? result.correct / result.total : 0;
  const tone = pct === 1 ? "perfect" : pct >= 0.6 ? "good" : "bad";

  return (
    <div className={`result result--${tone}`}>
      <div className="result__score">
        🏆 {result.score}{" "}
        <span className="result__pct">({Math.round(pct * 100)}%)</span>
      </div>
      {result.errors.length > 0 && (
        <ul className="result__errors">
          {result.errors.map((e, i) => (
            <li key={i}>
              ❌ <b>#{e.taskId}</b>: вы — «{e.your}», верно — «{e.correct}»
            </li>
          ))}
        </ul>
      )}
      <p className="result__status">
        {notified
          ? "✅ Результат сохранён и отправлен преподавателю"
          : notifyError
            ? tg?.initData
              ? "⚠️ Не удалось отправить. Проверьте соединение и попробуйте снова."
              : "⚠️ Откройте упражнение по кнопке из сообщения бота — иначе результат не сохранить."
            : "⏳ Отправка результата…"}
      </p>
    </div>
  );
}
