// Dev-only mock exercises for UI work without backend, Telegram or Supabase.
// Run `npm run dev` in webapp/ and open:
//   http://localhost:5173/?mock=matching   (gap-fill | matching | sorting | word-form)
//   http://localhost:5173/?mock            (first exercise)
// These are plain Exercise objects in the exact shape the AI produces, so
// every view/scoring path matches production. Mock mode is dev-only: the
// switch is gated by import.meta.env.DEV in App.tsx and never activates
// in a real build.
import type { Exercise } from "../types";

export const MOCK_EXERCISES: Exercise[] = [
  {
    id: "mock-gap-fill",
    title: "Money & Finance Vocabulary",
    instruction: "Complete the gaps with the words from the list.",
    task_type: "gap-fill",
    created_at: "2026-01-01T00:00:00Z",
    content: {
      passage:
        "I am trying to ___1___ enough money to buy a new laptop.\nCan I ___2___ your umbrella? It’s raining outside.\nDon't ___3___ your time watching silly videos all day.\nWe can't ___4___ to go on holiday abroad this year.\nHow much do software developers ___5___ in your city?",
      gaps: [
        { id: 1, answer: "save" },
        { id: 2, answer: "borrow" },
        { id: 3, answer: "waste" },
        { id: 4, answer: "afford" },
        { id: 5, answer: "earn" },
      ],
      wordBank: [
        { id: 1, word: "save" },
        { id: 2, word: "borrow" },
        { id: 3, word: "waste" },
        { id: 4, word: "afford" },
        { id: 5, word: "earn" },
      ],
    },
  },
  {
    id: "mock-matching",
    title: "Phrasal Verbs. Unit 3",
    instruction: "Match the phrasal verbs with their translations.",
    task_type: "matching",
    created_at: "2026-01-01T00:00:00Z",
    content: {
      pairs: [
        { id: 1, english: "to give up", russian: "сдаваться" },
        { id: 2, english: "to put off", russian: "откладывать на потом" },
        { id: 3, english: "to look after", russian: "присматривать, заботиться" },
        { id: 4, english: "to find out", russian: "выяснить, узнать" },
        { id: 5, english: "to carry on", russian: "продолжать" },
      ],
    },
  },
  {
    id: "mock-sorting",
    title: "Transport & Travel",
    instruction: "Sort the words into the three transport categories.",
    task_type: "sorting",
    created_at: "2026-01-01T00:00:00Z",
    content: {
      categories: [
        { id: "cat1", name: "Travel by Air" },
        { id: "cat2", name: "Travel by Sea" },
        { id: "cat3", name: "Travel by Land" },
      ],
      words: [
        { id: "w1", text: "runway", categoryId: "cat1" },
        { id: "w2", text: "cabin crew", categoryId: "cat1" },
        { id: "w3", text: "boarding pass", categoryId: "cat1" },
        { id: "w4", text: "ferry", categoryId: "cat2" },
        { id: "w5", text: "harbour", categoryId: "cat2" },
        { id: "w6", text: "deck", categoryId: "cat2" },
        { id: "w7", text: "platform", categoryId: "cat3" },
        { id: "w8", text: "motorway", categoryId: "cat3" },
        { id: "w9", text: "traffic jam", categoryId: "cat3" },
      ],
    },
  },
  {
    id: "mock-word-form",
    title: "Grammar Revision: Tenses & Passive",
    instruction: "Put the verbs in brackets into the correct form.",
    task_type: "word-form",
    created_at: "2026-01-01T00:00:00Z",
    content: {
      items: [
        {
          id: 1,
          before: "If it rains tomorrow, we",
          after: "to the park.",
          hint: "not / go",
          answer: "won't go",
          alt: ["will not go"],
        },
        {
          id: 2,
          before: "Look at those dark clouds! It",
          after: "soon.",
          hint: "rain",
          answer: "is going to rain",
          alt: ["'s going to rain"],
        },
        {
          id: 3,
          before: "She",
          after: "in Minsk since 2020.",
          hint: "live",
          answer: "has lived",
          alt: ["has been living"],
        },
        {
          // Blank at the very start of the sentence — the edge case that
          // used to break zod validation; keep it covered in the UI too.
          id: 4,
          before: "",
          after: "badly hurt in the past, she avoided the topic.",
          hint: "hurt",
          answer: "having been hurt",
        },
        {
          id: 5,
          before: "This bridge",
          after: "in the 19th century.",
          hint: "build",
          answer: "was built",
        },
      ],
    },
  },
];

/** Which mock to show: ?mock=<task_type>; bare ?mock = first one. */
export function mockKeyFromUrl(): string | null {
  const q = new URLSearchParams(window.location.search).get("mock");
  if (q === null) return null;
  return q || MOCK_EXERCISES[0].task_type;
}
