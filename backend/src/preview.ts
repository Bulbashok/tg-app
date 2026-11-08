// Renders an AI draft as human-readable Telegram text for teacher approval.
import type { ExerciseRow } from "./types.js";
import type {
  GapFillContent,
  MatchingContent,
  SortingContent,
  WordFormContent,
} from "./types.js";

export function formatPreview(ex: ExerciseRow): string {
  const header = `📘 ${ex.title}\n🎯 ${ex.task_type}\n\n${ex.instruction}\n`;

  switch (ex.task_type) {
    case "gap-fill": {
      const c = ex.content as GapFillContent;
      const answers = c.gaps.map((g, i) => `${i + 1}. ${g.answer}`).join("\n");
      return `${header}\n${c.passage}\n\n🔑 Ключи:\n${answers}\n\n🧰 Word bank: ${c.wordBank
        .map((w) => w.word)
        .join(", ")}`;
    }
    case "matching": {
      const c = ex.content as MatchingContent;
      const rows = c.pairs
        .map((p, i) => `${i + 1}) ${p.english} — ${p.russian}`)
        .join("\n");
      return `${header}\n${rows}`;
    }
    case "sorting": {
      const c = ex.content as SortingContent;
      const byCat = c.categories.map((cat) => {
        const words = c.words
          .filter((w) => w.categoryId === cat.id)
          .map((w) => w.text);
        return `• ${cat.name}: ${words.join(", ")}`;
      });
      return `${header}\n${byCat.join("\n")}`;
    }
    case "word-form": {
      const c = ex.content as WordFormContent;
      const rows = c.items.map((it, i) => {
        const alt = it.alt?.length ? ` | also: ${it.alt.join(", ")}` : "";
        // Running gap number, same as the app shows; `sentence` only groups.
        return `${i + 1}) ${it.before} [${it.answer}] ${it.after} (${it.hint})${alt}${it.sentence ? ` [sent ${it.sentence}]` : ""}`;
      });
      return `${header}\n${rows.join("\n")}\n\n✍️ Ученик печатает ответ сам (без word bank)`;
    }
  }
}

/** Total points an exercise is worth (used for score strings like "8/10"). */
export function totalItems(ex: ExerciseRow): number {
  switch (ex.task_type) {
    case "gap-fill":
      return (ex.content as GapFillContent).gaps.length;
    case "matching":
      return (ex.content as MatchingContent).pairs.length;
    case "sorting":
      return (ex.content as SortingContent).words.length;
    case "word-form":
      return (ex.content as WordFormContent).items.length;
  }
}
