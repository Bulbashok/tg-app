// 'matching' view: two parallel columns (English / Russian).
// Tap an English item, then a Russian item to connect them — both columns
// highlight with the same accent color AND a "↔ label" tag (text redundancy
// so pairs are identifiable without color vision). Re-tap to unpair.
// After submit, pairs are colored green (correct) / red (wrong).
import { useMemo, useState } from "react";
import type { MatchingContent } from "../types";
import type { Answers } from "../lib/scoring";
import { shuffle } from "../lib/utils";
import { haptic } from "../lib/telegram";

interface Props {
  content: MatchingContent;
  answers: Answers;
  revealed: boolean;
  onChange: (key: string, value: string) => void;
}

/** 5 rotating accent colors for formed pairs. */
const PALETTE = ["a", "b", "c", "d", "e"];

/** Display letter for the Russian column (position-based, A, B, C…). */
const letterFor = (index: number) => String.fromCharCode(65 + index);

export default function Matching({
  content,
  answers,
  revealed,
  onChange,
}: Props) {
  const [selectedEn, setSelectedEn] = useState<number | null>(null);

  // Russian column order is shuffled once per mount.
  const russianItems = useMemo(() => shuffle(content.pairs), [content.pairs]);

  // Letter label per russian id — for the "↔ G" tags on the English side.
  const letterById = useMemo(() => {
    const m: Record<string, string> = {};
    russianItems.forEach((p, idx) => (m[String(p.id)] = letterFor(idx)));
    return m;
  }, [russianItems]);

  // Correct russian text by id — for the recap strip after reveal.
  const ruById = useMemo(
    () => Object.fromEntries(content.pairs.map((p) => [String(p.id), p.russian])),
    [content.pairs],
  );

  // Which pair-id uses which accent color (stable per english id).
  const colorFor = (pairId: number) => PALETTE[pairId % PALETTE.length];

  const tapEnglish = (id: number) => {
    if (revealed) return;
    // Re-tapping a paired item clears its pair.
    if (answers[`en-${id}`]) {
      onChange(`en-${id}`, "");
      setSelectedEn(null);
      haptic("selection");
      return;
    }
    setSelectedEn((cur) => (cur === id ? null : id));
    haptic("selection");
  };

  const tapRussian = (ruId: number) => {
    if (revealed) return;
    if (selectedEn == null) return; // must start from the English column
    onChange(`en-${selectedEn}`, String(ruId));
    setSelectedEn(null);
    haptic("medium");
  };

  const isPairCorrect = (pairId: number) =>
    answers[`en-${pairId}`] === String(pairId);

  return (
    <div className="matching">
      <div className="matching__column">
        <h3 className="matching__head">English</h3>
        {content.pairs.map((p) => {
          const paired = !!answers[`en-${p.id}`];
          const ok = isPairCorrect(p.id);
          return (
            <button
              type="button"
              key={p.id}
              className={[
                "matching__item",
                selectedEn === p.id ? "is-selected" : "",
                // Pair accents only while solving; after reveal the
                // green/red states own the border instead.
                paired && !revealed ? `is-paired pair-${colorFor(p.id)}` : "",
                revealed ? (ok ? "is-correct" : "is-wrong") : "",
              ].join(" ")}
              onClick={() => tapEnglish(p.id)}
            >
              <span className="matching__num">{p.id}</span>
              {p.english}
              {revealed && paired ? (
                <span
                  className={`matching__mark ${ok ? "is-ok" : "is-bad"}`}
                >
                  {ok ? "✓" : "✕"}
                </span>
              ) : paired ? (
                <span
                  className={`matching__tag pair-${colorFor(p.id)}`}
                >
                  ↔ {letterById[answers[`en-${p.id}`]] ?? "?"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="matching__column">
        <h3 className="matching__head">Russian</h3>
        {russianItems.map((p, idx) => {
          // Is this russian item claimed by some english row?
          const ownerId = content.pairs.find(
            (q) => answers[`en-${q.id}`] === String(p.id),
          )?.id;
          const ok = ownerId === p.id;
          // The right partner of a wrong/missing english pick, left unclaimed:
          // reveal it as the correct answer with a dashed green frame.
          const missed = revealed && ownerId == null && !isPairCorrect(p.id);
          return (
            <button
              type="button"
              key={`ru-${p.id}`}
              className={[
                "matching__item",
                ownerId != null && !revealed
                  ? `is-paired pair-${colorFor(ownerId)}`
                  : "",
                revealed
                  ? ownerId != null
                    ? ok
                      ? "is-correct"
                      : "is-wrong"
                    : missed
                      ? "is-answer"
                      : ""
                  : "",
              ].join(" ")}
              onClick={() => tapRussian(p.id)}
            >
              <span className="matching__num">{letterFor(idx)}</span>
              {p.russian}
              {revealed && ownerId != null ? (
                <span className={`matching__mark ${ok ? "is-ok" : "is-bad"}`}>
                  {ok ? "✓" : "✕"}
                </span>
              ) : revealed && missed ? (
                <span className="matching__mark is-ok">✓</span>
              ) : ownerId != null ? (
                <span className={`matching__tag pair-${colorFor(ownerId)}`}>
                  ↔ {ownerId}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Micro horizontal scroll: swipeable recap of the student's own pairs
          with ✓/✕, shown after checking answers. */}
      {revealed && (
        <div className="matching__strip">
          {content.pairs.map((p) => {
            const ok = isPairCorrect(p.id);
            const chosen = answers[`en-${p.id}`];
            return (
              <span
                key={`strip-${p.id}`}
                className={`matching__strip-item ${ok ? "is-ok" : "is-bad"}`}
              >
                <span className="matching__num">{p.id}</span>
                {p.english} → {chosen ? ruById[chosen] : "—"}
                <span className={`matching__mark ${ok ? "is-ok" : "is-bad"}`}>
                  {ok ? "✓" : "✕"}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
