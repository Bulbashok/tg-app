// 'gap-fill' view: passage text interleaved with inputs + a Word Bank box.
// Tapping a gap opens a word picker right above it (no scrolling to the bank);
// typing works too and the bottom Word Bank stays as a fallback. After submit,
// inputs get green/red feedback styling via .is-correct/.is-wrong.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  // Which gap input currently has focus -> picks land there.
  const [activeGap, setActiveGap] = useState<number | null>(null);
  // Which gap shows its inline word picker (null = closed).
  const [pickerGap, setPickerGap] = useState<number | null>(null);
  const inputsRef = useRef<Record<number, HTMLInputElement | null>>({});
  // Only one picker is open at a time, so a single ref is enough.
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Keep the picker inside the viewport: gaps near the screen edges would
  // otherwise push the centered popup past the border on phones.
  useLayoutEffect(() => {
    const el = pickerRef.current;
    if (pickerGap == null || !el) return;
    el.style.transform = "translateX(-50%)";
    const margin = 8;
    const rect = el.getBoundingClientRect();
    let dx = 0;
    if (rect.left < margin) dx = margin - rect.left;
    else if (rect.right > window.innerWidth - margin)
      dx = window.innerWidth - margin - rect.right;
    if (dx) el.style.transform = `translateX(calc(-50% + ${dx}px))`;
  }, [pickerGap]);

  // Clicking anywhere outside the open picker closes it (mousedown so the
  // input keeps focus while a chip click is still delivered).
  useEffect(() => {
    if (pickerGap == null) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".gap-fill__slot"))
        setPickerGap(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pickerGap]);

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
    setPickerGap(null);
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
                <span key={pi} className="gap-fill__slot">
                  <input
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
                    onFocus={() => {
                      setActiveGap(p.gapId!);
                      if (!revealed) setPickerGap(p.gapId!);
                    }}
                    onChange={(e) => onChange(`gap-${p.gapId}`, e.target.value)}
                  />
                  {pickerGap === p.gapId && !revealed && (
                    <div
                      ref={pickerRef}
                      className="gap-fill__picker"
                      // Keep the input focused (and the keyboard open)
                      // while tapping chips.
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {bank.map((w) => {
                        const used = content.gaps.some(
                          (g) =>
                            g.id !== p.gapId &&
                            (answers[`gap-${g.id}`] ?? "").trim().toLowerCase() ===
                              w.word.toLowerCase(),
                        );
                        return (
                          <button
                            type="button"
                            key={`${w.id}-${w.word}`}
                            className={[
                              "word-bank__chip",
                              used ? "is-used" : "",
                            ].join(" ")}
                            onClick={() => applyWord(w.word)}
                          >
                            {w.word}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </span>
              ),
            )}
          </p>
        ))}
      </div>

      <aside className="word-bank">
        <h3 className="word-bank__title">Word Bank</h3>
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
            : "Tap a gap to pick a word — or type it yourself."}
        </p>
      </aside>
    </div>
  );
}
