import { connect } from "@tursodatabase/database";
import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import { exportDeckJson, importDeckJson } from "../lib/deck-json";
import { isoNow } from "../lib/time";
import { newCardFsrs, rateCard } from "../srs/scheduler";
import { createCard, deckStateCounts, getCard, listCards, studyQueue } from "./cards";
import type { DbConnection } from "./connection";
import { createDeck, deleteDeck, getDeck, listDecks } from "./decks";
import { migrate } from "./migrations";
import { recordReview, reviewTimesSince, scheduledDueTimes, totalReviewCount } from "./reviews";

async function openTestDb(): Promise<DbConnection> {
  const db: DbConnection = await connect(":memory:");
  await migrate(db);
  return db;
}

const now = Temporal.Instant.from("2026-07-11T12:00:00Z");
const nowIso = "2026-07-11T12:00:00.000Z";

async function seedDeckWithCard(db: DbConnection) {
  const deckId = await createDeck(db, "Spanish", "", nowIso);
  const cardId = await createCard(db, deckId, "hola", "hello", nowIso, newCardFsrs(now));
  return { deckId, cardId };
}

describe("migrate", () => {
  it("is idempotent", async () => {
    const db = await openTestDb();
    await migrate(db);
    const row = await db.get("PRAGMA user_version");
    expect(Number(row?.["user_version"])).toBe(1);
  });
});

describe("decks", () => {
  it("lists decks with new/due counts", async () => {
    const db = await openTestDb();
    const { deckId, cardId } = await seedDeckWithCard(db);
    await createCard(db, deckId, "adiós", "goodbye", nowIso, newCardFsrs(now));

    let [deck] = await listDecks(db, nowIso);
    expect(deck).toMatchObject({ id: deckId, totalCount: 2, newCount: 2, dueCount: 0 });

    // Rating a card moves it from "new" to scheduled; once due it is counted.
    const card = (await getCard(db, cardId))!;
    const { fsrs, log } = rateCard(card, Rating.Good, now);
    await recordReview(db, cardId, fsrs, log);
    [deck] = await listDecks(db, "2027-01-01T00:00:00.000Z");
    expect(deck).toMatchObject({ newCount: 1, dueCount: 1 });
  });

  it("deletes a deck with its cards and review logs", async () => {
    const db = await openTestDb();
    const { deckId, cardId } = await seedDeckWithCard(db);
    const card = (await getCard(db, cardId))!;
    const { fsrs, log } = rateCard(card, Rating.Good, now);
    await recordReview(db, cardId, fsrs, log);

    await deleteDeck(db, deckId);
    expect(await getDeck(db, deckId)).toBeUndefined();
    expect(await listCards(db, deckId)).toEqual([]);
    expect(await totalReviewCount(db)).toBe(0);
  });
});

describe("studyQueue", () => {
  it("returns due cards before new cards and respects the new-card limit", async () => {
    const db = await openTestDb();
    const deckId = await createDeck(db, "Deck", "", nowIso);
    const newIds = [];
    for (let i = 0; i < 3; i++) {
      newIds.push(await createCard(db, deckId, `new ${i}`, "x", nowIso, newCardFsrs(now)));
    }
    // One reviewed card, due before "later".
    const dueId = await createCard(db, deckId, "due", "x", nowIso, newCardFsrs(now));
    const { fsrs, log } = rateCard((await getCard(db, dueId))!, Rating.Good, now);
    await recordReview(db, dueId, fsrs, log);

    const later = "2027-01-01T00:00:00.000Z";
    const queue = await studyQueue(db, deckId, later, 2);
    expect(queue.map((c) => c.id)).toEqual([dueId, newIds[0], newIds[1]]);
    expect(queue[0]!.state).not.toBe(State.New);
  });
});

describe("deckStateCounts", () => {
  it("counts cards per FSRS state, scoped to the deck", async () => {
    const db = await openTestDb();
    const { deckId, cardId } = await seedDeckWithCard(db);
    await createCard(db, deckId, "adiós", "goodbye", nowIso, newCardFsrs(now));
    const otherDeckId = await createDeck(db, "Other", "", nowIso);
    await createCard(db, otherDeckId, "elsewhere", "x", nowIso, newCardFsrs(now));

    const { fsrs, log } = rateCard((await getCard(db, cardId))!, Rating.Good, now);
    await recordReview(db, cardId, fsrs, log);

    expect(await deckStateCounts(db, deckId)).toEqual({
      [State.New]: 1,
      [State.Learning]: 1,
      [State.Review]: 0,
      [State.Relearning]: 0,
    });
  });
});

describe("reviews", () => {
  it("records reviews atomically and feeds the stats queries", async () => {
    const db = await openTestDb();
    const { cardId } = await seedDeckWithCard(db);
    const { fsrs, log } = rateCard((await getCard(db, cardId))!, Rating.Good, now);
    await recordReview(db, cardId, fsrs, log);

    const updated = (await getCard(db, cardId))!;
    expect(updated.reps).toBe(1);
    expect(updated.state).toBe(State.Learning);

    expect(await totalReviewCount(db)).toBe(1);
    expect(await reviewTimesSince(db, "2026-01-01T00:00:00.000Z")).toEqual([nowIso]);
    expect(await reviewTimesSince(db, "2026-12-01T00:00:00.000Z")).toEqual([]);
    expect(await scheduledDueTimes(db)).toEqual([updated.due]);
  });
});

describe("deck JSON roundtrip", () => {
  it("exports and re-imports a deck including scheduling state", async () => {
    const db = await openTestDb();
    const { deckId, cardId } = await seedDeckWithCard(db);
    const { fsrs, log } = rateCard((await getCard(db, cardId))!, Rating.Good, now);
    await recordReview(db, cardId, fsrs, log);

    const exported = await exportDeckJson(db, deckId);
    // Roundtrip through JSON like a real file would.
    const importedId = await importDeckJson(db, JSON.parse(JSON.stringify(exported)));

    const original = await listCards(db, deckId);
    const imported = await listCards(db, importedId);
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({
      front: original[0]!.front,
      back: original[0]!.back,
      due: original[0]!.due,
      state: original[0]!.state,
      stability: original[0]!.stability,
    });
  });

  it("rejects files without cards and restarts malformed FSRS state", async () => {
    const db = await openTestDb();
    await expect(importDeckJson(db, { version: 1, deck: { name: "x" } })).rejects.toThrow(
      /cards array/,
    );

    const deckId = await importDeckJson(db, {
      version: 1,
      deck: { name: "partial" },
      cards: [{ front: "f", back: "b", fsrs: { due: "garbage-only" } }],
    });
    const [card] = await listCards(db, deckId);
    expect(card!.state).toBe(State.New);
  });
});

describe("time helper", () => {
  it("isoNow uses fixed millisecond precision", () => {
    expect(isoNow()).toMatch(/\.\d{3}Z$/);
  });
});
