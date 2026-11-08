// 'word-form' view: open cloze / word formation / key word transformation.
// One numbered sentence per line: text before the blank, a typed input,
// text after the blank and the (hint) word. No word bank — free typing.
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
    return [item.answer, ...(item.alt ?? [])]
      .map(normText)
      .includes(your);
  };

  return (
    <div className="word-form">
      {content.items.map((item, i) => (
        <p className="word-form__line" key={item.id}>
          <span className="word-form__num">{i + 1}.</span>
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
