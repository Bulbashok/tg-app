// 'gap-fill' view: passage text interleaved with inputs + a Word Bank box.
// Tapping a word-bank chip fills the currently focused gap; typing works too.
// After submit, inputs get green/red feedback styling via .is-correct/.is-wrong.
import { useMemo, useRef, useState } from "react";
import type { GapFillContent } from "../types";
import type { Answers } from "../lib/scoring";
import { shuffle } from "../lib/utils";
import { haptic } from "../lib/telegram";

interface Props {
  content: GapFillContent;
  answers: Answers;
  revealed: boolean;
  onChange: (key: string, value: string) => void;
}

const GAP_MARKER = /___(\d+)___/;

export default function GapFill({
  content,
  answers,
  revealed,
  onChange,
}: Props) {
  // Which gap input currently has focus -> word-bank taps land there.
  const [activeGap, setActiveGap] = useState<number | null>(null);
  const inputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  // Word bank is shuffled once per mount (answers stay stable across re-renders).
  const bank = useMemo(() => shuffle(content.wordBank), [content.wordBank]);

  // Split the passage into text/gap segments for every line.
  const lines = useMemo(
    () =>
      content.passage.split("\n").map((line) => {
        const parts: Array<{
          type: "text" | "gap";
          value: string;
          gapId?: number;
        }> = [];
        let rest = line;
        while (rest.length) {
          const m = rest.match(GAP_MARKER);
          if (!m || m.index === undefined) {
            parts.push({ type: "text", value: rest });
            break;
          }
          if (m.index > 0)
            parts.push({ type: "text", value: rest.slice(0, m.index) });
          parts.push({ type: "gap", value: m[0], gapId: Number(m[1]) });
          rest = rest.slice(m.index + m[0].length);
        }
        return parts;
      }),
    [content.passage],
  );

  const isGapCorrect = (id: number) =>
    (answers[`gap-${id}`] ?? "").trim().toLowerCase() ===
    content.gaps
      .find((g) => g.id === id)
      ?.answer.trim()
      .toLowerCase();

  const applyWord = (word: string) => {
    if (activeGap == null) return;
    onChange(`gap-${activeGap}`, word);
    haptic("light");
  };

  return (
    <div className="gap-fill">
      <div className="gap-fill__passage">
        {lines.map((parts, li) => (
          <p className="gap-fill__line" key={li}>
            {parts.map((p, pi) =>
              p.type === "text" ? (
                <span key={pi}>{p.value}</span>
              ) : (
                <input
                  key={pi}
                  ref={(el) => {
                    inputsRef.current[p.gapId!] = el;
                  }}
                  className={[
                    "gap-fill__input",
                    revealed
                      ? isGapCorrect(p.gapId!)
                        ? "is-correct"
                        : "is-wrong"
                      : "",
                  ].join(" ")}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder={String(p.gapId)}
                  value={answers[`gap-${p.gapId}`] ?? ""}
                  onFocus={() => setActiveGap(p.gapId!)}
                  onChange={(e) => onChange(`gap-${p.gapId}`, e.target.value)}
                />
              ),
            )}
          </p>
        ))}
      </div>

      <aside className="word-bank">
        <h3 className="word-bank__title">🧰 Word Bank</h3>
        <div className="word-bank__chips">
          {bank.map((w) => (
            <button
              type="button"
              key={`${w.id}-${w.word}`}
              className="word-bank__chip"
              onClick={() => applyWord(w.word)}
              disabled={revealed}
            >
              {w.word}
            </button>
          ))}
        </div>
        <p className="word-bank__hint">
          {revealed
            ? ""
            : "Выберите пробел, затем слово в Word Bank (или печатайте вручную)"}
        </p>
      </aside>
    </div>
  );
}
