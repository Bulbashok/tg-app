// 'matching' view: two parallel columns (English / Russian).
// Tap an English item, then a Russian item to connect them — both columns
// highlight with the same accent color per pair. Re-tap to unpair.
// After submit, pairs are colored green (correct) / red (wrong).
import { useMemo, useState } from 'react';
import type { MatchingContent } from '../types';
import type { Answers } from '../lib/scoring';
import { shuffle } from '../lib/utils';
import { haptic } from '../lib/telegram';

interface Props {
  content: MatchingContent;
  answers: Answers;
  revealed: boolean;
  onChange: (key: string, value: string) => void;
}

/** 5 rotating accent colors for formed pairs. */
const PALETTE = ['a', 'b', 'c', 'd', 'e'];

export default function Matching({ content, answers, revealed, onChange }: Props) {
  const [selectedEn, setSelectedEn] = useState<number | null>(null);

  // Russian column order is shuffled once per mount.
  const russianItems = useMemo(() => shuffle(content.pairs), [content.pairs]);

  // Which pair-id uses which accent color (stable per english id).
  const colorFor = (pairId: number) => PALETTE[pairId % PALETTE.length];

  const tapEnglish = (id: number) => {
    if (revealed) return;
    // Re-tapping a paired item clears its pair.
    if (answers[`en-${id}`]) {
      onChange(`en-${id}`, '');
      setSelectedEn(null);
      haptic('selection');
      return;
    }
    setSelectedEn((cur) => (cur === id ? null : id));
    haptic('selection');
  };

  const tapRussian = (ruId: number) => {
    if (revealed) return;
    if (selectedEn == null) return; // must start from the English column
    onChange(`en-${selectedEn}`, String(ruId));
    setSelectedEn(null);
    haptic('medium');
  };

  const isPairCorrect = (pairId: number) => answers[`en-${pairId}`] === String(pairId);

  return (
    <div className="matching">
      <div className="matching__column">
        <h3 className="matching__head">English</h3>
        {content.pairs.map((p) => {
          const paired = !!answers[`en-${p.id}`];
          return (
            <button
              type="button"
              key={p.id}
              className={[
                'matching__item',
                selectedEn === p.id ? 'is-selected' : '',
                paired ? `is-paired pair-${colorFor(p.id)}` : '',
                revealed ? (isPairCorrect(p.id) ? 'is-correct' : 'is-wrong') : '',
              ].join(' ')}
              onClick={() => tapEnglish(p.id)}
            >
              <span className="matching__num">{p.id}</span>
              {p.english}
              {paired && <span className={`matching__dot pair-${colorFor(p.id)}`} />}
            </button>
          );
        })}
      </div>

      <div className="matching__column">
        <h3 className="matching__head">Russian</h3>
        {russianItems.map((p) => {
          // Is this russian item claimed by some english row?
          const ownerId = content.pairs.find((q) => answers[`en-${q.id}`] === String(p.id))?.id;
          return (
            <button
              type="button"
              key={`ru-${p.id}`}
              className={[
                'matching__item',
                ownerId != null ? `is-paired pair-${colorFor(ownerId)}` : '',
                revealed && ownerId != null
                  ? ownerId === p.id
                    ? 'is-correct'
                    : 'is-wrong'
                  : '',
              ].join(' ')}
              onClick={() => tapRussian(p.id)}
            >
              {p.russian}
              {ownerId != null && <span className={`matching__dot pair-${colorFor(ownerId)}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
