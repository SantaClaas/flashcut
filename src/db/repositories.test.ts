import { connect } from "@tursodatabase/database";
import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import { exportDeckJson, importDeckJson } from "../lib/deck-json";
import { isoNow } from "../lib/time";
import { newCardFsrs, rateCard } from "../srs/scheduler";
import {
  createCard,
  deckStateCounts,
  getCard,
  getSchedule,
  listCards,
  setReverseEnabled,
  studyQueue,
} from "./cards";
import type { DbConnection } from "./connection";
import { createDeck, deleteDeck, getDeck, listDecks } from "./decks";
import { MIGRATIONS, migrate } from "./migrations";
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
    expect(Number(row?.["user_version"])).toBe(2);
  });

  it("moves FSRS state from v1 cards into forward schedules", async () => {
    const db: DbConnection = await connect(":memory:");
    await db.exec(MIGRATIONS[0]!);
    await db.exec("PRAGMA user_version = 1");
    await db.run(
      "INSERT INTO decks (name, description, created_at) VALUES (?, ?, ?)",
      "Old",
      "",
      nowIso,
    );
    await db.run(
      `INSERT INTO cards (
         deck_id, front, back, created_at,
         due, stability, difficulty, elapsed_days, scheduled_days,
         learning_steps, reps, lapses, state, last_review
       ) VALUES (1, 'hola', 'hello', ?, '2026-07-12T12:00:00.000Z', 2.5, 6.1, 0, 1, 1, 3, 1, ${State.Review}, ?)`,
      nowIso,
      nowIso,
    );

    await migrate(db);

    const schedule = (await getSchedule(db, 1, "forward"))!;
    expect(schedule).toMatchObject({
      due: "2026-07-12T12:00:00.000Z",
      stability: 2.5,
      difficulty: 6.1,
      reps: 3,
      lapses: 1,
      state: State.Review,
      lastReview: nowIso,
    });
    expect(await getSchedule(db, 1, "reverse")).toBeUndefined();
    expect((await getCard(db, 1))!).toMatchObject({ front: "hola", back: "hello" });
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
    const schedule = (await getSchedule(db, cardId, "forward"))!;
    const { fsrs, log } = rateCard(schedule, Rating.Good, now);
    await recordReview(db, cardId, "forward", fsrs, log);
    [deck] = await listDecks(db, "2027-01-01T00:00:00.000Z");
    expect(deck).toMatchObject({ newCount: 1, dueCount: 1 });
  });

  it("counts each enabled study direction, ignoring dormant ones", async () => {
    const db = await openTestDb();
    const { cardId } = await seedDeckWithCard(db);
    await setReverseEnabled(db, cardId, true, newCardFsrs(now));

    let [deck] = await listDecks(db, nowIso);
    expect(deck).toMatchObject({ totalCount: 1, newCount: 2 });

    await setReverseEnabled(db, cardId, false, newCardFsrs(now));
    [deck] = await listDecks(db, nowIso);
    expect(deck).toMatchObject({ totalCount: 1, newCount: 1 });
  });

  it("deletes a deck with its cards, schedules, and review logs", async () => {
    const db = await openTestDb();
    const { deckId, cardId } = await seedDeckWithCard(db);
    const schedule = (await getSchedule(db, cardId, "forward"))!;
    const { fsrs, log } = rateCard(schedule, Rating.Good, now);
    await recordReview(db, cardId, "forward", fsrs, log);

    await deleteDeck(db, deckId);
    expect(await getDeck(db, deckId)).toBeUndefined();
    expect(await listCards(db, deckId)).toEqual([]);
    expect(await getSchedule(db, cardId, "forward")).toBeUndefined();
    expect(await totalReviewCount(db)).toBe(0);
  });
});

describe("reverse study", () => {
  it("creates an independently rated second study item", async () => {
    const db = await openTestDb();
    const deckId = await createDeck(db, "Deck", "", nowIso);
    const cardId = await createCard(db, deckId, "hola", "hello", nowIso, newCardFsrs(now), {
      enabled: true,
      fsrs: newCardFsrs(now),
    });

    const queue = await studyQueue(db, deckId, nowIso, 10);
    expect(queue.map((item) => [item.id, item.direction]).sort()).toEqual([
      [cardId, "forward"],
      [cardId, "reverse"],
    ]);

    const reverseSchedule = (await getSchedule(db, cardId, "reverse"))!;
    const { fsrs, log } = rateCard(reverseSchedule, Rating.Good, now);
    await recordReview(db, cardId, "reverse", fsrs, log);

    // The reverse rating leaves the forward schedule untouched.
    expect((await getSchedule(db, cardId, "reverse"))!.reps).toBe(1);
    expect((await getSchedule(db, cardId, "forward"))!.reps).toBe(0);
    const logRow = await db.get("SELECT direction FROM review_logs WHERE card_id = ?", cardId);
    expect(logRow?.["direction"]).toBe("reverse");
  });

  it("keeps a disabled reverse schedule dormant and resumes it on re-enable", async () => {
    const db = await openTestDb();
    const { deckId, cardId } = await seedDeckWithCard(db);
    await setReverseEnabled(db, cardId, true, newCardFsrs(now));
    const reverseSchedule = (await getSchedule(db, cardId, "reverse"))!;
    const { fsrs, log } = rateCard(reverseSchedule, Rating.Good, now);
    await recordReview(db, cardId, "reverse", fsrs, log);

    await setReverseEnabled(db, cardId, false, newCardFsrs(now));
    expect(
      (await studyQueue(db, deckId, "2027-01-01T00:00:00.000Z", 10)).map((i) => i.direction),
    ).toEqual(["forward"]);
    expect((await deckStateCounts(db, deckId))[State.Learning]).toBe(0);
    expect((await getCard(db, cardId))!.reverseEnabled).toBe(false);
    // Dormant, not deleted: progress survives.
    expect((await getSchedule(db, cardId, "reverse"))!.reps).toBe(1);

    await setReverseEnabled(db, cardId, true, newCardFsrs(now));
    expect((await getSchedule(db, cardId, "reverse"))!.reps).toBe(1);
    expect((await getCard(db, cardId))!.reverseEnabled).toBe(true);
  });
});

describe("studyQueue", () => {
  // Deterministic rng stubs: keepOrder makes Fisher-Yates a no-op (j === i),
  // reverse always picks j === 0, which flips two-element buckets.
  const keepOrder = () => 0.999999;
  const reverse = () => 0;

  it("respects the new-card limit and spreads new cards through the due cards", async () => {
    const db = await openTestDb();
    const deckId = await createDeck(db, "Deck", "", nowIso);
    const newIds = [];
    for (let i = 0; i < 3; i++) {
      newIds.push(await createCard(db, deckId, `new ${i}`, "x", nowIso, newCardFsrs(now)));
    }
    // One reviewed card, due before "later".
    const dueId = await createCard(db, deckId, "due", "x", nowIso, newCardFsrs(now));
    const schedule = (await getSchedule(db, dueId, "forward"))!;
    const { fsrs, log } = rateCard(schedule, Rating.Good, now);
    await recordReview(db, dueId, "forward", fsrs, log);

    const later = "2027-01-01T00:00:00.000Z";
    const queue = await studyQueue(db, deckId, later, 2, keepOrder);
    // The oldest two new cards are selected and interleaved with the due card.
    expect(queue.map((c) => c.id)).toEqual([newIds[0], dueId, newIds[1]]);
  });

  it("shuffles due cards within a day but keeps older days first", async () => {
    const db = await openTestDb();
    const deckId = await createDeck(db, "Deck", "", nowIso);
    const dueOn = (due: string) => ({ ...newCardFsrs(now), state: State.Review, due });
    const a1 = await createCard(db, deckId, "a1", "x", nowIso, dueOn("2026-07-09T08:00:00.000Z"));
    const a2 = await createCard(db, deckId, "a2", "x", nowIso, dueOn("2026-07-09T09:00:00.000Z"));
    const b1 = await createCard(db, deckId, "b1", "x", nowIso, dueOn("2026-07-10T08:00:00.000Z"));

    const ids = async (rng: () => number) =>
      (await studyQueue(db, deckId, nowIso, 0, rng)).map((c) => c.id);
    expect(await ids(keepOrder)).toEqual([a1, a2, b1]);
    // Within the 2026-07-09 bucket the order flips; the newer day stays last.
    expect(await ids(reverse)).toEqual([a2, a1, b1]);
  });
});

describe("deckStateCounts", () => {
  it("counts study items per FSRS state, scoped to the deck", async () => {
    const db = await openTestDb();
    const { deckId, cardId } = await seedDeckWithCard(db);
    await createCard(db, deckId, "adiós", "goodbye", nowIso, newCardFsrs(now));
    const otherDeckId = await createDeck(db, "Other", "", nowIso);
    await createCard(db, otherDeckId, "elsewhere", "x", nowIso, newCardFsrs(now));

    const schedule = (await getSchedule(db, cardId, "forward"))!;
    const { fsrs, log } = rateCard(schedule, Rating.Good, now);
    await recordReview(db, cardId, "forward", fsrs, log);

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
    const schedule = (await getSchedule(db, cardId, "forward"))!;
    const { fsrs, log } = rateCard(schedule, Rating.Good, now);
    await recordReview(db, cardId, "forward", fsrs, log);

    const updated = (await getSchedule(db, cardId, "forward"))!;
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
    const schedule = (await getSchedule(db, cardId, "forward"))!;
    const { fsrs, log } = rateCard(schedule, Rating.Good, now);
    await recordReview(db, cardId, "forward", fsrs, log);

    const exported = await exportDeckJson(db, deckId);
    // Roundtrip through JSON like a real file would.
    const importedId = await importDeckJson(db, JSON.parse(JSON.stringify(exported)));

    const original = (await getSchedule(db, cardId, "forward"))!;
    const [importedCard] = await listCards(db, importedId);
    expect(importedCard).toMatchObject({ front: "hola", back: "hello" });
    expect((await getSchedule(db, importedCard!.id, "forward"))!).toMatchObject({
      due: original.due,
      state: original.state,
      stability: original.stability,
    });
  });

  it("roundtrips reverse schedules, including dormant ones", async () => {
    const db = await openTestDb();
    const deckId = await createDeck(db, "Deck", "", nowIso);
    await createCard(db, deckId, "a", "x", nowIso, newCardFsrs(now), {
      enabled: true,
      fsrs: newCardFsrs(now),
    });
    const dormantId = await createCard(db, deckId, "d", "x", nowIso, newCardFsrs(now), {
      enabled: true,
      fsrs: newCardFsrs(now),
    });
    const reverseSchedule = (await getSchedule(db, dormantId, "reverse"))!;
    const { fsrs, log } = rateCard(reverseSchedule, Rating.Good, now);
    await recordReview(db, dormantId, "reverse", fsrs, log);
    await setReverseEnabled(db, dormantId, false, newCardFsrs(now));

    const exported = await exportDeckJson(db, deckId);
    const importedId = await importDeckJson(db, JSON.parse(JSON.stringify(exported)));

    const imported = await listCards(db, importedId);
    const active = imported.find((c) => c.front === "a")!;
    const dormant = imported.find((c) => c.front === "d")!;
    expect(active.reverseEnabled).toBe(true);
    expect(dormant.reverseEnabled).toBe(false);
    expect((await getSchedule(db, dormant.id, "reverse"))!.reps).toBe(1);
  });

  it("imports files without reverse entries as forward-only", async () => {
    const db = await openTestDb();
    const deckId = await importDeckJson(db, {
      version: 1,
      deck: { name: "old format" },
      cards: [{ front: "f", back: "b" }],
    });
    const [card] = await listCards(db, deckId);
    expect(card!.reverseEnabled).toBe(false);
    expect(await getSchedule(db, card!.id, "reverse")).toBeUndefined();
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
    expect((await getSchedule(db, card!.id, "forward"))!.state).toBe(State.New);
  });
});

describe("time helper", () => {
  it("isoNow uses fixed millisecond precision", () => {
    expect(isoNow()).toMatch(/\.\d{3}Z$/);
  });
});
