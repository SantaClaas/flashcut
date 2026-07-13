/**
 * Decks bundled with the app (served from public/decks/). Metadata is kept here so the Settings
 * page can list them without fetching every file.
 */
export interface StarterDeck {
  name: string;
  description: string;
  cardCount: number;
  url: string;
}

export const STARTER_DECKS: StarterDeck[] = [
  {
    name: "Programming Languages (PLC)",
    description:
      "Haskell, Rust ownership & traits, memory management, error handling, concurrency, and metaprogramming.",
    cardCount: 76,
    url: `${import.meta.env.BASE_URL}decks/programming-languages.flashcut.json`,
  },
  {
    name: "Requirements Engineering (PERE Klausur)",
    description:
      "Exam-focused RE deck from PERE lecture materials: User Stories, INVEST, quality criteria, Use Cases, interviews, risk, MVP/MMP, and Agile/Scrum.",
    cardCount: 58,
    url: `${import.meta.env.BASE_URL}decks/requirements-engineering-klausur.flashcut.json`,
  },
];
