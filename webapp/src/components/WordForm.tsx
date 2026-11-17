// 'word-form' view: open cloze / word formation / key word transformation.
// One numbered sentence per line: text before the blank, a typed input,
// text after the blank and the (hint) word. No word bank — free typing.
// A textbook sentence may contain several blanks (Q&A line): they share one
// number and stack as a single hanging-indent entry (number in its own
// column, follow-up lines aligned under the first line's text).
import { useRef } from "react";
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
  const inputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  const isCorrect = (id: number) => {
    const item = content.items.find((it) => it.id === id);
    if (!item) return false;
    const your = normText(answers[`wf-${id}`] ?? "");
    return [item.answer, ...(item.alt ?? [])].map(normText).includes(your);
  };

  // One label per gap: entry numbers are sequential 1..N (normalized on
  // load); gaps after the first in an entry are grouped under that number.
  const numbered = content.items.map((item, i) => {
    const prev = i > 0 ? content.items[i - 1].sentence : undefined;
    const sent = item.sentence ?? i + 1;
    return { item, num: sent, index: i, cont: item.sentence !== undefined && item.sentence === prev };
  });

  // Fold continuation gaps into the entry opened by their first gap, so a
  // multi-sentence item reads as one block instead of separate ruled lines.
  const entries: { num: number; gaps: typeof numbered }[] = [];
  numbered.forEach((gap) => {
    const last = entries[entries.length - 1];
    if (gap.cont && last) last.gaps.push(gap);
    else entries.push({ num: gap.num, gaps: [gap] });
  });

  // Enter moves to the next blank — the phone keyboard's "continue" key.
  const focusNext = (index: number) => {
    const next = numbered[(index + 1) % numbered.length];
    inputsRef.current[next.item.id]?.focus();
  };

  return (
    <div className="word-form">
      {entries.map((entry) => (
        <div className="word-form__entry" key={entry.gaps[0].item.id}>
          <span className="word-form__num">{entry.num}.</span>
          <div className="word-form__body">
            {entry.gaps.map(({ item, index }) => (
              <p className="word-form__line" key={item.id}>
                <span>{item.before}&nbsp;</span>
                <input
                  ref={(el) => {
                    inputsRef.current[item.id] = el;
                  }}
                  className={[
                    "word-form__input",
                    revealed ? (isCorrect(item.id) ? "is-correct" : "is-wrong") : "",
                  ].join(" ")}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  // Width follows the STUDENT'S OWN text, clamped: sizing it to
                  // answer.length leaked the expected answer's length, while a
                  // constant width hid long typed answers behind a scroll.
                  // ch + a CSS width transition grows it smoothly, not in snaps.
                  style={{
                    width: `${Math.max(12, Math.min(24, (answers[`wf-${item.id}`] ?? "").length + 2))}ch`,
                  }}
                  value={answers[`wf-${item.id}`] ?? ""}
                  onChange={(e) => onChange(`wf-${item.id}`, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    focusNext(index);
                  }}
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
        </div>
      ))}
    </div>
  );
}
