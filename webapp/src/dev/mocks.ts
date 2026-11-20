// Dev-only mock exercises for UI work without backend, Telegram or Supabase.
// Run `npm run dev` in webapp/ and open:
//   http://localhost:5173/?mock=matching   (gap-fill | matching | sorting | word-form | choice)
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
        "I am trying to ___1___ enough money to buy a new laptop.\nCan I ___2___ your umbrella? It’s raining outside.\nDon't ___3___ your time watching silly videos all day.\nWe can't ___4___ to go on holiday abroad this year.\nHow much do software developers ___5___ in your city?\nThe thieves managed to ___6___ away before the police arrived.\nDid you ___7___ the joke he made at lunch?",
      gaps: [
        { id: 1, answer: "save" },
        { id: 2, answer: "borrow" },
        { id: 3, answer: "waste" },
        { id: 4, answer: "afford" },
        { id: 5, answer: "earn" },
        // Repeated answer on purpose: duplicate bank entries must dim
        // per placed copy, not strike every chip sharing the text.
        { id: 6, answer: "get" },
        { id: 7, answer: "get" },
      ],
      wordBank: [
        { id: 1, word: "save" },
        { id: 2, word: "borrow" },
        { id: 3, word: "waste" },
        { id: 4, word: "afford" },
        { id: 5, word: "earn" },
        // Distractors on purpose: a long bank must overflow the picker's
        // height cap and scroll inside it (regression case).
        { id: 6, word: "lend" },
        { id: 7, word: "spend" },
        { id: 8, word: "cost" },
        { id: 9, word: "pay" },
        { id: 10, word: "charge" },
        { id: 11, word: "budget" },
        { id: 12, word: "invest" },
        { id: 13, word: "withdraw" },
        { id: 14, word: "deposit" },
        { id: 15, word: "interest" },
        { id: 16, word: "currency" },
        { id: 17, word: "receipt" },
        { id: 18, word: "refund" },
        { id: 19, word: "salary" },
        { id: 20, word: "debt" },
        { id: 21, word: "get" },
        { id: 22, word: "get" },
        { id: 23, word: "get" },
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
          sentence: 1,
          before: "Your brother",
          after: "a student now.",
          hint: "be",
          answer: "is",
        },
        {
          // Second gap of entry 1 (Q&A short answer): shares sentence 1 so it
          // stacks under the same number — covers the hanging-indent group.
          id: 6,
          sentence: 1,
          before: "Yes, he",
          after: "at university.",
          hint: "study",
          answer: "studies",
          alt: ["is studying"],
        },
        {
          id: 2,
          sentence: 2,
          before: "Look at those dark clouds! It",
          after: "soon.",
          hint: "rain",
          answer: "is going to rain",
          alt: ["'s going to rain"],
        },
        {
          id: 3,
          sentence: 3,
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
          sentence: 4,
          before: "",
          after: "badly hurt in the past, she avoided the topic.",
          hint: "hurt",
          answer: "having been hurt",
        },
        {
          id: 5,
          sentence: 5,
          before: "This bridge",
          after: "in the 19th century.",
          hint: "build",
          answer: "was built",
        },
        {
          // Raw AI-style defect kept on purpose: the (HINT) token leaked into
          // `after`, which used to print the hint twice. normalizeExercise()
          // must strip it at load time.
          id: 7,
          sentence: 6,
          before: "Thank you so much for your help, it was really",
          after: "(USE).",
          hint: "USE",
          answer: "useful",
        },
        {
          // Second raw defect: the phrase between the two blanks is copied
          // into BOTH `after` and the next `before`. The load-time sanitizer
          // keeps it once, in the continuation line's `before`.
          id: 8,
          sentence: 7,
          before: "She",
          after: "a beautiful dream when the alarm clock",
          hint: "have",
          answer: "was having",
          alt: ["had"],
        },
        {
          id: 9,
          sentence: 7,
          before: "when the alarm clock",
          after: ".",
          hint: "ring",
          answer: "rang",
        },
      ],
    },
  },
  {
    id: "mock-choice",
    title: "Used to / Be used to",
    instruction: "Circle the correct answer in each sentence.",
    task_type: "choice",
    created_at: "2026-01-01T00:00:00Z",
    content: {
      items: [
        {
          id: 1,
          before: "When I was a child, I",
          options: ["didn't use to like", "didn't use to be liking"],
          after: "vegetables.",
          answer: "didn't use to like",
        },
        {
          id: 2,
          before: "It took me a long time",
          options: ["to be used to working", "to get used to working"],
          after: "night shifts.",
          answer: "to get used to working",
        },
        {
          // Raw AI-style defects on purpose: a stray "/" copied onto the
          // option edge and an UPPER-CASE answer. normalizeExercise() must
          // strip the slash and snap the answer to the option spelling.
          id: 3,
          before: "Maria",
          options: ["isn't used to live", "isn't used to living /"],
          after: "with people. She's finding it quite tough.",
          answer: "ISN'T USED TO LIVING",
        },
        {
          id: 4,
          before: "Jim",
          options: ["used to be", "is used to be"],
          after: "a lawyer. Now he's a professional boxer.",
          answer: "used to be",
        },
        {
          id: 5,
          before: "I",
          options: ["am getting used to drive", "am getting used to driving"],
          after: "on the left side of the road.",
          answer: "am getting used to driving",
        },
        {
          id: 6,
          before: "Be careful of the dog. He",
          options: ["didn't use to", "isn't used to"],
          after: "children.",
          answer: "isn't used to",
        },
        {
          id: 7,
          before: "Jerry",
          options: ["didn't used to be", "didn't use to be"],
          after: "interested in dinosaurs. Now he's fascinated by them.",
          answer: "didn't use to be",
        },
        {
          id: 8,
          before: "Sara has been widowed for over 30 years, so she",
          options: ["is used to be", "is used to being"],
          after: "alone.",
          answer: "is used to being",
        },
        {
          id: 9,
          before: "When I moved to India, I found it hard",
          options: ["to be used to eating", "to get used to eating"],
          after: "spicy food.",
          answer: "to get used to eating",
        },
        {
          id: 10,
          before: "I lived in England for 10 years, so I",
          options: ["am used to", "used to"],
          after: "wet weather.",
          answer: "am used to",
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
