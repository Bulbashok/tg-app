// AI vision integration via any OpenAI-compatible provider.
// Default: Groq + qwen/qwen3.8-27b (Groq's current vision model — the Llama
// vision models were removed). Provider is fully configurable via
// AI_BASE_URL / AI_API_KEY / AI_MODEL (e.g. OpenRouter as an alternative).
// image URL -> strict exercise JSON.
import OpenAI from "openai";
import { env } from "./env.js";
import { parseExerciseDraft, type ExerciseRow } from "./types.js";

// Optional: route only AI traffic through a proxy (HTTPS_PROXY / HTTP_PROXY
// in .env). Useful for local development from blocked regions; on Render and
// OpenRouter it is not needed. Implemented as a custom fetch with an undici
// ProxyAgent dispatcher, because Node's built-in fetch ignores httpAgent.
type ClientOptions = ConstructorParameters<typeof OpenAI>[0];
let clientOpts: ClientOptions = {
  apiKey: env.aiApiKey,
  baseURL: env.aiBaseUrl,
};
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
if (proxyUrl) {
  const { fetch: undiciFetch, ProxyAgent } = await import("undici");
  const dispatcher = new ProxyAgent(proxyUrl);
  const proxiedFetch = (input: unknown, init?: Record<string, unknown>) =>
    undiciFetch(input as never, { ...init, dispatcher } as never);
  clientOpts = { ...clientOpts, fetch: proxiedFetch as never };
}

// maxRetries: the SDK retries 429/5xx with exponential backoff automatically.
// Groq's shared free-tier capacity can 503 briefly ("over capacity"), so
// ride out short spikes instead of surfacing the error to the teacher.
const ai = new OpenAI({ ...clientOpts, maxRetries: 4 });

// Predefined system prompt: forces a machine-checkable JSON contract.
const SYSTEM_PROMPT = `You are an exercise generator for an English-language textbook.
You will receive a screenshot of a textbook page. Convert the visible task into ONE interactive exercise and reply with STRICT JSON only — no markdown, no code fences, no commentary.

Choose the single best "task_type" for the page: "gap-fill", "matching", "sorting" or "word-form".

Type selection guide:
- If the task says "Put the verb in brackets into the correct form", "open the
  brackets", or "Complete the second sentence using the word given" (key word
  transformation) -> use "word-form". NEVER turn these into gap-fill: there is
  NO word bank; the student types the answer themselves.
- gap-fill only when the page itself provides a box/list of words to choose from.

JSON contract (top level):
{
  "title":       short exercise name in English, e.g. "Unit 5. Phrasal verbs",
  "instruction": one short imperative sentence in English for the student, e.g. "Match the English words with their Russian translations" (the app UI is English; never write this in Russian),
  "task_type":   "gap-fill" | "matching" | "sorting" | "word-form",
  "content":     object matching the schema for the chosen task_type
}

content schemas:
- gap-fill: {
    "passage": text containing numbered gap markers like "She ___1___ home.", one sentence per line,
    "gaps":    [{"id": 1, "answer": "goes"}, ...]  (exact key for each marker),
    "wordBank":[{"id": 1, "word": "goes"}, ...]    (one word per gap; ids may repeat only if the same word is reused)
  }
- matching: { "pairs": [{"id": 1, "english": "to give up", "russian": "сдаваться"}, ...] } (4-14 pairs)
- sorting:  {
    "categories": [{"id": "cat1", "name": "Food"}, ...] (2-4 groups visible on the page),
    "words":      [{"id": "w1", "text": "apple", "categoryId": "cat1"}, ...] (6-16 words)
  }
- word-form: {
    "items": [{
      "id": 1,
      "sentence": 1,                             // number of the textbook ENTRY (1, 2, 3...) this blank belongs to,
      "before": "We are waiting for his first novel",   // sentence text left of the blank,
      "after":  "in England.",                          // text right of the blank (may be "")
      "hint":   "publish",                              // base word from brackets / given key word
      "answer": "to be published",                      // expected typed answer (can be several words)
      "alt":    ["to get published"]                    // optional accepted alternatives
    }, ...] (4-13 items)
  }
  For word-form, "sentence" is the number of the textbook ENTRY (the exercise
  is renumbered 1..N by the app, so never copy page numbers like 10, 12).
  Several sentences can belong to ONE entry — e.g. a question and its short
  answer form a single numbered item: ALL their gaps must share that ONE
  sentence number. NEVER split one entry into several numbers, NEVER give
  two different entries the same number.
  For key word transformation ("Do not change the word given"): the "answer"
  must contain the hint word unchanged, plus the other words needed.

Rules:
- Use ONLY material present in the screenshot; never invent extra vocabulary.
- Answers must be unambiguous strings, compared case-insensitively
  (word-form answers may consist of several words).
- Output COMPACT MINIFIED JSON: no newlines, no indentation, no spaces
  between tokens (hard token budget ~1000 output tokens). Omit "alt" when
  there are no alternatives; keep "before"/"after" as short fragments.
- Caps: max 10 gaps, 14 pairs, 16 words or 13 word-form items — short
  strings fit easily; only trim if the page genuinely has more items than
  the limit (take the first ones then).
- If an exercise has more than 8 items, OMIT every "alt" array to save tokens.
- No comments, no explanations, no trailing text. Short strings only.
- Output must be valid JSON parseable by JSON.parse.`;

/** Tolerant JSON extraction: models sometimes wrap output in fences/prose. */
function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error(
        `Model did not return JSON. Raw reply:\n${text.slice(0, 300)}`,
      );
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

/** Send the stored image to the vision model and return a validated draft. */
export async function parseImageToExercise(
  imageUrl: string,
): Promise<ExerciseRow> {
  const completion = await ai.chat.completions.create({
    model: env.aiModel,
    temperature: 0.2, // deterministic structure > creativity here
    // Capped below Groq's free-tier 1000 OTPM gate; override via
    // AI_MAX_OUTPUT_TOKENS once billing is upgraded.
    max_completion_tokens: env.aiMaxOutputTokens,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Convert this textbook page into one exercise following the contract.",
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      "Задание на скриншоте слишком большое, ответ ИИ обрезался. Сделайте скрин поменьше (меньше пунктов).",
    );
  }

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("The model returned an empty response");

  // Throws if the model deviated from the contract — caller shows it to the teacher.
  return parseExerciseDraft(extractJson(raw));
}

/**
 * Grammar hints for word-form mistakes. Correctness is decided
 * deterministically in the app — the AI only explains WHY the required form
 * fits the sentence and what the student's form would mean. One hint per
 * mistake, keyed by task id. Any failure returns null: hints are
 * decoration and must never block or break the submission itself.
 * Other task types do not use this — a wrong matching pair needs no grammar
 * explanation.
 */
export async function generateFormHints(payload: {
  mistakes: {
    taskId: number;
    your: string;
    correct: string;
    before: string;
    after: string;
    hint: string;
  }[];
}): Promise<{ taskId: number; why: string }[] | null> {
  if (!payload.mistakes.length) return null;

  const list = payload.mistakes
    .map(
      (m) =>
        `id=${m.taskId}: "${m.before} ___. ${m.after}" (base: ${m.hint}) — student: "${m.your}", correct: "${m.correct}"`,
    )
    .join("\n");

  // Hard time budget: Groq answers in <1s normally, but overload retries
  // could hang the student's request — abort after 8 seconds.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const completion = await ai.chat.completions.create(
      {
        model: env.aiModel,
        temperature: 0.3,
        // ~1 short sentence per mistake (max 13 items), JSON overhead included.
        max_completion_tokens: 400,
        messages: [
          {
            role: "system",
            content:
              `You are an English grammar coach for a student. For every numbered mistake below, write ONE short neutral explanation (max 120 characters, English, plain text) of why the correct form is required in this exact sentence and what the student's form would mean instead. Do not restate the answers, do not praise.\n` +
              `Reply with STRICT JSON only: {"hints":[{"id":<taskId>,"why":"..."},...]}\n` +
              `Include one hint object for every mistake id.`,
          },
          { role: "user", content: list },
        ],
      },
      { signal: ctrl.signal },
    );
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = extractJson(raw) as {
      hints?: { id?: unknown; why?: unknown }[];
    };
    const out = (parsed.hints ?? [])
      .filter(
        (h) =>
          typeof h.id === "number" ||
          (typeof h.id === "string" && !Number.isNaN(Number(h.id))),
      )
      .map((h) => ({
        taskId: Number(h.id),
        why: String(h.why ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200),
      }))
      .filter((h) => h.why);
    return out.length ? out : null;
  } catch (err) {
    console.error("form hints skipped:", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
