import { State } from "ts-fsrs";

import { type FsrsColumns, createCard, listCards, listSchedules } from "../db/cards";
import { type DbConnection, withTransaction } from "../db/connection";
import { createDeck, getDeck } from "../db/decks";
import { newCardFsrs } from "../srs/scheduler";
import { isoNow } from "./time";

export interface DeckExport {
  version: 1;
  exportedAt: string;
  deck: { name: string; description: string };
  cards: Array<{
    front: string;
    back: string;
    /** Forward (front→back) schedule. */
    fsrs?: FsrsColumns;
    /** Back→front study; `enabled: false` is a dormant schedule keeping its progress. */
    reverse?: { enabled: boolean; fsrs?: FsrsColumns };
  }>;
}

export async function exportDeckJson(db: DbConnection, deckId: number): Promise<DeckExport> {
  const deck = await getDeck(db, deckId);
  if (!deck) throw new Error(`Deck ${deckId} not found`);
  const cards = await listCards(db, deckId);
  const schedules = new Map(
    (await listSchedules(db, deckId)).map((s) => [`${s.cardId}:${s.direction}`, s]),
  );
  const toFsrs = (s: FsrsColumns): FsrsColumns => ({
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsedDays: s.elapsedDays,
    scheduledDays: s.scheduledDays,
    learningSteps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    lastReview: s.lastReview,
  });
  return {
    version: 1,
    exportedAt: isoNow(),
    deck: { name: deck.name, description: deck.description },
    cards: cards.map((item) => {
      const forward = schedules.get(`${item.id}:forward`);
      const reverse = schedules.get(`${item.id}:reverse`);
      return {
        front: item.front,
        back: item.back,
        ...(forward ? { fsrs: toFsrs(forward) } : {}),
        ...(reverse ? { reverse: { enabled: reverse.enabled, fsrs: toFsrs(reverse) } } : {}),
      };
    }),
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
        item.reverse && {
          enabled: item.reverse.enabled,
          fsrs: item.reverse.fsrs ?? newCardFsrs(Temporal.Instant.from(now)),
        },
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
    const reverse = parseReverse(cardRecord["reverse"]);
    return { front, back, ...(fsrs ? { fsrs } : {}), ...(reverse ? { reverse } : {}) };
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

/** Returns a validated reverse entry, or undefined when absent/malformed (no reverse study). */
function parseReverse(value: unknown): { enabled: boolean; fsrs?: FsrsColumns } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record["enabled"] !== "boolean") return undefined;
  const fsrs = parseFsrs(record["fsrs"]);
  return { enabled: record["enabled"], ...(fsrs ? { fsrs } : {}) };
}

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
