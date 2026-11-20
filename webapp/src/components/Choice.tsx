// 'choice' view: "circle the correct answer" — every sentence prints its
// alternatives inline (italic serif, separated by a quiet "/"), exactly like
// the textbook page. Tapping an option draws a hand-set pen ring around it
// (one overshooting loop, stroke-dashoffset draw-on); tapping again erases
// the ring. On reveal the correct option gets a green ring + ✓ and a wrong
// pick a red ring + ✕ with the text struck — feedback never relies on hue
// alone. Rings draw in sequence down the page so the check reads as a wave.
import type { ChoiceContent } from "../types";
import type { Answers } from "../lib/scoring";
import { haptic } from "../lib/telegram";

interface Props {
  content: ChoiceContent;
  answers: Answers;
  revealed: boolean;
  onChange: (key: string, value: string) => void;
}

// One hand-drawn loop that overshoots its own start, like a real pen circle.
// viewBox is stretched to the option box (preserveAspectRatio="none"); the
// dash draw-on lives in the same user units (see _choice.scss), so it stays
// exact at any option size.
const RING_PATH =
  "M62 6 C36 3 10 10 7 21 C4 33 28 44 60 43 C92 42 115 34 113 21 C111 9 88 4 58 6 C40 7 22 10 13 16";

export default function Choice({
  content,
  answers,
  revealed,
  onChange,
}: Props) {
  const pick = (id: number, option: string) => {
    const key = `ch-${id}`;
    const same = (answers[key] ?? "") === option;
    onChange(key, same ? "" : option);
    haptic(same ? "selection" : "light");
  };

  return (
    <div className="choice">
      {content.items.map((item, i) => {
        const chosen = answers[`ch-${item.id}`] ?? "";
        return (
          <div
            className="choice__entry"
            key={item.id}
            role="group"
            aria-label={`Sentence ${i + 1}`}
          >
            <span className="choice__num">{i + 1}.</span>
            <p className="choice__line">
              {item.before && <span>{item.before}&nbsp;</span>}
              {item.options.map((opt, oi) => {
                const isChosen = chosen === opt;
                const isAnswer =
                  opt.toLowerCase() === item.answer.toLowerCase();
                const state = revealed
                  ? isAnswer
                    ? "is-correct"
                    : isChosen
                      ? "is-wrong"
                      : "is-dim"
                  : isChosen
                    ? "is-circled"
                    : "";
                return (
                  <span className="choice__opt-wrap" key={`${item.id}-${oi}`}>
                    {oi > 0 && (
                      <span className="choice__slash" aria-hidden="true">
                        /
                      </span>
                    )}
                    <button
                      type="button"
                      className={["choice__option", state].join(" ")}
                      aria-pressed={isChosen}
                      disabled={revealed}
                      onClick={() => pick(item.id, opt)}
                    >
                      <span className="choice__text">{opt}</span>
                      {/* Width is reserved before reveal too, so checking
                          never reflows the sentence. Plain glyph, no chip. */}
                      <span
                        className={[
                          "choice__mark",
                          revealed && isAnswer
                            ? "choice__mark--ok"
                            : revealed && isChosen
                              ? "choice__mark--no"
                              : "",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        {revealed && isAnswer
                          ? "✓"
                          : revealed && isChosen
                            ? "✕"
                            : "\u00A0"}
                      </span>
                      <svg
                        className="choice__ring"
                        viewBox="0 0 120 48"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path
                          d={RING_PATH}
                          style={
                            revealed
                              ? { transitionDelay: `${i * 70}ms` }
                              : undefined
                          }
                        />
                      </svg>
                    </button>
                  </span>
                );
              })}
              {item.after && (
                <span>
                  {/^[.,;:!?…)\]]/.test(item.after) ? "" : "\u00A0"}
                  {item.after}
                </span>
              )}
            </p>
          </div>
        );
      })}
      {!revealed && (
        <p className="choice__hint">
          Tap an option to circle it — tap again to erase.
        </p>
      )}
    </div>
  );
}