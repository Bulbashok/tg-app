// 'gap-fill' view: passage text interleaved with inputs. Tapping a gap opens
// a word picker right above it — the single word source (the old bottom Word
// Bank was removed); typing works too. After submit, inputs get green/red
// feedback styling via .is-correct/.is-wrong.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  // Gap that just received a picked word — brief tint so the landing spot
  // is visible even when the picker covered it.
  const [flashGap, setFlashGap] = useState<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const inputsRef = useRef<Record<number, HTMLInputElement | null>>({});
  // Only one picker is open at a time, so a single ref pair is enough:
  // the glass shell (portal) and its scrolling chip list.
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // The picker lives in a body-level portal: every glass pane around it
  // (backdrop-filter) is its own stacking context, so an inline popover loses
  // to later panes no matter its z-index. Fixed positioning + a top-level
  // z-index keeps it above everything. The same pass caps its height to the
  // free space and flips it below the gap when above is tighter.
  useLayoutEffect(() => {
    const shell = pickerRef.current;
    const list = listRef.current;
    const input = pickerGap == null ? null : inputsRef.current[pickerGap];
    if (pickerGap == null || !shell || !list || !input) return;
    const margin = 8;
    const offset = 10; // popover distance from the gap
    const pad = 24; // shell padding around the scroll list
    const cap = 296; // list cap -> 320px shell
    const fades = () => {
      list.dataset.fadeTop = list.scrollTop > 4 ? "1" : "0";
      list.dataset.fadeBottom =
        list.scrollTop + list.clientHeight < list.scrollHeight - 4 ? "1" : "0";
    };
    const place = () => {
      const slot = input.parentElement!.getBoundingClientRect();
      const above = slot.top - margin - offset;
      const below = window.innerHeight - margin - offset - slot.bottom;
      const flip = list.scrollHeight + pad > above && below > above;
      const space = flip ? below : above;
      list.style.maxHeight = `${Math.max(96, Math.min(cap, space - pad))}px`;
      shell.style.transformOrigin = flip ? "top center" : "bottom center";
      // offsetWidth/Height ignore the entrance scale, so the clamp and the
      // flip stay exact while the spring animation is still running.
      const w = shell.offsetWidth;
      const center = slot.left + slot.width / 2;
      const left = Math.min(
        Math.max(center - w / 2, margin),
        window.innerWidth - margin - w,
      );
      shell.style.left = `${left}px`;
      shell.style.top = `${
        flip ? slot.bottom + offset : slot.top - offset - shell.offsetHeight
      }px`;
      fades();
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    list.addEventListener("scroll", fades);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      list.removeEventListener("scroll", fades);
    };
  }, [pickerGap]);

  // Clicking anywhere outside the open picker closes it (mousedown so the
  // input keeps focus while a chip click is still delivered).
  useEffect(() => {
    if (pickerGap == null) return;
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".gap-fill__slot") && !t.closest(".gap-fill__picker"))
        setPickerGap(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pickerGap]);

  // Never leave a flash timer running after the view unmounts.
  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  // Word bank is shuffled once per mount (answers stay stable across re-renders).
  const bank = useMemo(() => shuffle(content.wordBank), [content.wordBank]);

  // Stable per-copy ordinal among same-text bank entries (in shuffled
  // order), so the dimmed subset never jumps around between renders.
  const copyOrdinal = useMemo(() => {
    const seen = new Map<string, number>();
    return bank.map((w) => {
      const k = w.word.toLowerCase();
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return n;
    });
  }, [bank]);

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

  // Gap ids in passage order — Enter jumps to the next blank, the natural
  // "continue" key on a phone keyboard.
  const gapOrder = useMemo(
    () =>
      lines.flatMap((parts) =>
        parts.filter((p) => p.type === "gap").map((p) => p.gapId!),
      ),
    [lines],
  );

  const focusNextGap = (id: number) => {
    const i = gapOrder.indexOf(id);
    const next = gapOrder[(i + 1) % gapOrder.length];
    inputsRef.current[next]?.focus();
  };

  // How many copies of each word sit in OTHER gaps: with duplicate bank
  // entries (phrasal particles like "get" repeat across gaps) only that
  // many chips dim — matching by text alone struck EVERY copy after one
  // pick. Dimmed chips stay tappable (a word may legitimately repeat).
  const usedElsewhere = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of content.gaps) {
      if (g.id === activeGap) continue;
      const w = (answers[`gap-${g.id}`] ?? "").trim().toLowerCase();
      if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return counts;
  }, [content.gaps, answers, activeGap]);

  const applyWord = (word: string) => {
    if (activeGap == null) return;
    onChange(`gap-${activeGap}`, word);
    haptic("light");
    setPickerGap(null);
    setFlashGap(activeGap);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashGap(null), 260);
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
                      flashGap === p.gapId ? "is-flash" : "",
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
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      setPickerGap(null);
                      focusNextGap(p.gapId!);
                    }}
                  />
                  {pickerGap === p.gapId &&
                    !revealed &&
                    createPortal(
                      <div
                        ref={pickerRef}
                        className="gap-fill__picker"
                        // Keep the input focused (and the keyboard open)
                        // while tapping chips.
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        <div ref={listRef} className="gap-fill__picker-list">
                          {bank.map((w, i) => {
                            const used =
                              copyOrdinal[i] <
                              (usedElsewhere.get(w.word.toLowerCase()) ?? 0);
                            return (
                              <button
                                type="button"
                                key={`${w.id}-${w.word}`}
                                className={[
                                  "gap-fill__chip",
                                  used ? "is-used" : "",
                                ].join(" ")}
                                onClick={() => applyWord(w.word)}
                              >
                                {w.word}
                              </button>
                            );
                          })}
                        </div>
                      </div>,
                      document.body,
                    )}
                </span>
              ),
            )}
          </p>
        ))}
      </div>

      {!revealed && (
        <p className="gap-fill__hint">
          Tap a gap to pick a word — or type it yourself.
        </p>
      )}
    </div>
  );
}
