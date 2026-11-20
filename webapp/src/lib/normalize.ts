// Word-form `sentence` is a group key coming from the AI: consecutive gaps
// of one textbook entry (e.g. a question + its short answer) share it. The
// model may print any numbers (even textbook page ones like 10, 12), so
// renumber groups to guaranteed sequential 1..N before rendering — this
// also fixes exercises stored before the backend started normalizing.
// Mirrors normalizeWordFormItems() in the backend; idempotent.
//
// The same pass repairs two recurring parse defects at read time, because
// the Mini App fetches rows straight from Supabase and never re-parses:
//  * the (HINT) token leaked into `before`/`after`, printing the hint twice;
//  * the phrase between two gaps of one entry was copied into BOTH the
//    first gap's `after` and the second gap's `before`.
// Choice items get the same dual-sided treatment: stray "/" separators on
// option edges, duplicate options and answer casing are repaired at read
// time (mirrors normalizeChoiceItems() in the backend).
import type { Exercise, WordFormContent, ChoiceContent } from "../types";

const collapseSpace = (s: string) => s.replace(/\s+/g, " ").trim();

/** Drop a "(HINT)" token the model copied into the sentence text itself. */
function stripHintToken(text: string, hint: string): string {
  const words = collapseSpace(hint)
    .split(" ")
    .filter(Boolean)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return collapseSpace(text);
  const token = new RegExp(`\\(\\s*${words.join("\\s+")}\\s*\\)`, "gi");
  return collapseSpace(text.replace(token, ""));
}

/** Longest suffix of `a` equal to a prefix of `b`, on word boundaries only
 * (so "bus" / "stop" never loses its last letter to a 1-char coincidence). */
function sharedOverlap(a: string, b: string): number {
  for (let k = Math.min(a.length, b.length); k >= 1; k--) {
    if (a.slice(a.length - k).toLowerCase() !== b.slice(0, k).toLowerCase())
      continue;
    const leftOk = k === a.length || /\s/.test(a[a.length - k - 1]);
    const rightOk = k === b.length || /\s/.test(b[k]);
    if (leftOk && rightOk) return k;
  }
  return 0;
}

export function normalizeExercise(ex: Exercise): Exercise {
  if (ex.task_type === "choice") {
    const content = ex.content as ChoiceContent;
    const items = content.items.map((it) => {
      const seen = new Set<string>();
      const options = it.options
        .map((o) => collapseSpace(o.replace(/^\/+|\/+$/g, "")))
        .filter((o) => {
          const k = o.toLowerCase();
          if (!o || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      const answer = collapseSpace(it.answer);
      const hit = options.find((o) => o.toLowerCase() === answer.toLowerCase());
      return {
        ...it,
        before: collapseSpace(it.before),
        after: collapseSpace(it.after),
        options,
        answer: hit ?? answer,
      };
    });
    return { ...ex, content: { ...content, items } };
  }
  if (ex.task_type !== "word-form") return ex;
  // Exercise is not a discriminated union, so narrow via an explicit cast.
  const content = ex.content as WordFormContent;
  const items = content.items.map((it) => ({
    ...it,
    before: stripHintToken(it.before, it.hint),
    after: stripHintToken(it.after, it.hint),
  }));
  // One entry's gaps read as continuous text: the phrase between two blanks
  // belongs to EITHER the first `after` OR the second `before`, never both.
  // Keep it in `before` so a continuation line starts with words, not a gap.
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    if (cur.sentence === undefined || cur.sentence !== prev.sentence) continue;
    const k = sharedOverlap(prev.after, cur.before);
    if (k > 0)
      prev.after = collapseSpace(prev.after.slice(0, prev.after.length - k));
  }
  if (!items.some((it) => typeof it.sentence === "number")) {
    return { ...ex, content: { ...content, items } };
  }
  let group = 0;
  let prev: number | null = null;
  const renumbered = items.map((it) => {
    const s = it.sentence ?? null;
    if (s !== prev) group++;
    prev = s;
    return { ...it, sentence: group };
  });
  return { ...ex, content: { ...content, items: renumbered } };
}