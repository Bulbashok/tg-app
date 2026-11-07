// Groq (Llama Vision) integration: image URL -> strict exercise JSON.
import Groq from 'groq-sdk';
import { env } from './env.js';
import { parseExerciseDraft, type ExerciseRow } from './types.js';

// Optional: route only Groq traffic through a proxy (HTTPS_PROXY / HTTP_PROXY
// in .env). Needed for local development from regions Groq blocks at its
// edge; on Render the service runs in the US, so leave it unset there.
// Implemented as a custom fetch with an undici ProxyAgent dispatcher,
// because Node's built-in fetch ignores httpAgent.
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
let clientOpts: ConstructorParameters<typeof Groq>[0] = { apiKey: env.groqApiKey };
if (proxyUrl) {
  const { fetch: undiciFetch, ProxyAgent } = await import('undici');
  const dispatcher = new ProxyAgent(proxyUrl);
  const proxiedFetch = (input: unknown, init?: Record<string, unknown>) =>
    undiciFetch(input as never, { ...init, dispatcher } as never);
  clientOpts = { ...clientOpts, fetch: proxiedFetch as never };
}

const groq = new Groq(clientOpts);

// Predefined system prompt: forces a machine-checkable JSON contract.
const SYSTEM_PROMPT = `You are an exercise generator for an English-language textbook.
You will receive a screenshot of a textbook page. Convert the visible task into ONE interactive exercise and reply with STRICT JSON only — no markdown, no code fences, no commentary.

Choose the single best "task_type" for the page: "gap-fill", "matching" or "sorting".

JSON contract (top level):
{
  "title":       short exercise name, e.g. "Unit 5. Phrasal verbs",
  "instruction": the task instruction shown to the student (in the language of the textbook page),
  "task_type":   "gap-fill" | "matching" | "sorting",
  "content":     object matching the schema for the chosen task_type
}

content schemas:
- gap-fill: {
    "passage": text containing numbered gap markers like "She ___1___ home.", one sentence per line,
    "gaps":    [{"id": 1, "answer": "goes"}, ...]  (exact key for each marker),
    "wordBank":[{"id": 1, "word": "goes"}, ...]    (one word per gap; ids may repeat only if the same word is reused)
  }
- matching: { "pairs": [{"id": 1, "english": "to give up", "russian": "сдаваться"}, ...] } (4-10 pairs)
- sorting:  {
    "categories": [{"id": "cat1", "name": "Food"}, ...] (2-4 groups visible on the page),
    "words":      [{"id": "w1", "text": "apple", "categoryId": "cat1"}, ...] (6-12 words)
  }

Rules:
- Use ONLY material present in the screenshot; never invent extra vocabulary.
- Answers must be unambiguous single strings (case-insensitive comparison later).
- Output must be valid JSON parseable by JSON.parse.`;

/** Send the stored image to Llama Vision and return a validated exercise draft. */
export async function parseImageToExercise(imageUrl: string): Promise<ExerciseRow> {
  const completion = await groq.chat.completions.create({
    model: env.groqModel,
    temperature: 0.2, // deterministic structure > creativity here
    max_tokens: 2048,
    response_format: { type: 'json_object' }, // Groq JSON mode
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Convert this textbook page into one exercise following the contract.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('Groq returned an empty response');

  // Throws ZodError if the model deviated from the contract — caller shows it to the teacher.
  return parseExerciseDraft(JSON.parse(raw));
}
