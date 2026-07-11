import { State } from "ts-fsrs";

import { type FsrsColumns, createCard, listCards } from "../db/cards";
import { type DbConnection, withTransaction } from "../db/connection";
import { createDeck, getDeck } from "../db/decks";
import { newCardFsrs } from "../srs/scheduler";
import { isoNow } from "./time";

export interface DeckExport {
  version: 1;
  exportedAt: string;
  deck: { name: string; description: string };
  cards: Array<{ front: string; back: string; fsrs?: FsrsColumns }>;
}

export async function exportDeckJson(db: DbConnection, deckId: number): Promise<DeckExport> {
  const deck = await getDeck(db, deckId);
  if (!deck) throw new Error(`Deck ${deckId} not found`);
  const cards = await listCards(db, deckId);
  return {
    version: 1,
    exportedAt: isoNow(),
    deck: { name: deck.name, description: deck.description },
    cards: cards.map((item) => ({
      front: item.front,
      back: item.back,
      fsrs: {
        due: item.due,
        stability: item.stability,
        difficulty: item.difficulty,
        elapsedDays: item.elapsedDays,
        scheduledDays: item.scheduledDays,
        learningSteps: item.learningSteps,
        reps: item.reps,
        lapses: item.lapses,
        state: item.state,
        lastReview: item.lastReview,
      },
    })),
  };
}

/**
 * Creates a new deck from parsed JSON; cards without valid FSRS state start as new. Returns the
 * deck id.
 */
export async function importDeckJson(db: DbConnection, data: unknown): Promise<number> {
  const parsed = parseDeckExport(data);
  const now = isoNow();
  return withTransaction(db, async () => {
    const deckId = await createDeck(db, parsed.deck.name, parsed.deck.description, now);
    for (const item of parsed.cards) {
      await createCard(
        db,
        deckId,
        item.front,
        item.back,
        now,
        item.fsrs ?? newCardFsrs(Temporal.Instant.from(now)),
      );
    }
    return deckId;
  });
}

export function parseDeckExport(data: unknown): DeckExport {
  if (typeof data !== "object" || data === null) {
    throw new Error("Not a valid Flashcut deck file: not an object");
  }
  const record = data as Record<string, unknown>;
  if (record["version"] !== 1) {
    throw new Error("Not a valid Flashcut deck file: unsupported version");
  }
  const deck = record["deck"];
  if (
    typeof deck !== "object" ||
    deck === null ||
    typeof (deck as Record<string, unknown>)["name"] !== "string"
  ) {
    throw new Error("Not a valid Flashcut deck file: missing deck name");
  }
  const deckRecord = deck as Record<string, unknown>;
  const cardsRaw = record["cards"];
  if (!Array.isArray(cardsRaw)) {
    throw new Error("Not a valid Flashcut deck file: missing cards array");
  }
  const cards = cardsRaw.map((item, index) => {
    const cardRecord = (typeof item === "object" && item !== null ? item : {}) as Record<
      string,
      unknown
    >;
    const front = cardRecord["front"];
    const back = cardRecord["back"];
    if (typeof front !== "string" || typeof back !== "string") {
      throw new Error(
        `Not a valid Flashcut deck file: card ${index + 1} needs front and back strings`,
      );
    }
    const fsrs = parseFsrs(cardRecord["fsrs"]);
    return fsrs ? { front, back, fsrs } : { front, back };
  });
  return {
    version: 1,
    exportedAt: typeof record["exportedAt"] === "string" ? record["exportedAt"] : "",
    deck: {
      name: deckRecord["name"] as string,
      description: typeof deckRecord["description"] === "string" ? deckRecord["description"] : "",
    },
    cards,
  };
}

const NUMERIC_FSRS_FIELDS = [
  "stability",
  "difficulty",
  "elapsedDays",
  "scheduledDays",
  "learningSteps",
  "reps",
  "lapses",
  "state",
] as const;

/** Returns validated FSRS state, or undefined when absent/malformed (card restarts as new). */
function parseFsrs(value: unknown): FsrsColumns | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record["due"] !== "string") return undefined;
  if (NUMERIC_FSRS_FIELDS.some((field) => typeof record[field] !== "number")) return undefined;
  if (record["lastReview"] != null && typeof record["lastReview"] !== "string") return undefined;
  return {
    due: record["due"],
    stability: record["stability"] as number,
    difficulty: record["difficulty"] as number,
    elapsedDays: record["elapsedDays"] as number,
    scheduledDays: record["scheduledDays"] as number,
    learningSteps: record["learningSteps"] as number,
    reps: record["reps"] as number,
    lapses: record["lapses"] as number,
    state: record["state"] as State,
    lastReview: (record["lastReview"] as string | undefined) ?? null,
  };
}
