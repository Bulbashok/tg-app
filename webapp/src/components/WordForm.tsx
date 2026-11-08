// 'word-form' view: open cloze / word formation / key word transformation.
// One numbered sentence per line: text before the blank, a typed input,
// text after the blank and the (hint) word. No word bank — free typing.
// A textbook sentence may contain several blanks (Q&A line): they share one
// number — only the first gap shows it, the rest join under a bracket bar.
import type { WordFormContent } from "../types";
import type { Answers } from "../lib/scoring";
import { normText } from "../lib/scoring";

interface Props {
  content: WordFormContent;
  answers: Answers;
  revealed: boolean;
  onChange: (key: string, value: string) => void;
}

export default function WordForm({
  content,
  answers,
  revealed,
  onChange,
}: Props) {
  const isCorrect = (id: number) => {
    const item = content.items.find((it) => it.id === id);
    if (!item) return false;
    const your = normText(answers[`wf-${id}`] ?? "");
    return [item.answer, ...(item.alt ?? [])].map(normText).includes(your);
  };

  // Number label per gap: textbook sentence number when the parser gave
  // one (or for old exercises without `sentence`, plain 1..n positions).
  const numbered = content.items.map((item, i) => ({
    item,
    num: item.sentence ?? i + 1,
    // Continuation gap of the same sentence: no repeated number.
    cont: i > 0 && item.sentence !== undefined &&
      item.sentence === content.items[i - 1].sentence,
  }));

  return (
    <div className="word-form">
      {numbered.map(({ item, num, cont }) => (
        <p
          className={[
            "word-form__line",
            cont ? "word-form__line--cont" : "",
          ].join(" ")}
          key={item.id}
        >
          <span className="word-form__num">{cont ? "" : `${num}.`}</span>
          <span>{item.before}&nbsp;</span>
          <input
            className={[
              "word-form__input",
              revealed ? (isCorrect(item.id) ? "is-correct" : "is-wrong") : "",
            ].join(" ")}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            // Wide enough for the expected answer, so it stays readable.
            size={Math.max(12, item.answer.length + 2)}
            value={answers[`wf-${item.id}`] ?? ""}
            onChange={(e) => onChange(`wf-${item.id}`, e.target.value)}
            disabled={revealed}
          />
          {item.after && <span>&nbsp;{item.after}</span>}
          <span className="word-form__hint">({item.hint})</span>
          {revealed && !isCorrect(item.id) && (
            <span className="word-form__answer">→ {item.answer}</span>
          )}
        </p>
      ))}
    </div>
  );
}
