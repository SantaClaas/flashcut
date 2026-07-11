import { Rating, State } from "ts-fsrs";
import { describe, expect, it } from "vitest";

import { GRADES, newCardFsrs, previewIntervals, rateCard } from "./scheduler";

const now = Temporal.Instant.from("2026-07-11T12:00:00Z");

describe("newCardFsrs", () => {
  it("creates a new card due immediately", () => {
    const fsrs = newCardFsrs(now);
    expect(fsrs.state).toBe(State.New);
    expect(fsrs.reps).toBe(0);
    expect(fsrs.lapses).toBe(0);
    expect(fsrs.lastReview).toBeNull();
    expect(fsrs.due).toBe("2026-07-11T12:00:00.000Z");
  });

  it("stores instants with fixed millisecond precision so SQL string comparison works", () => {
    expect(newCardFsrs(now).due).toMatch(/\.\d{3}Z$/);
  });
});

describe("rateCard", () => {
  it("moves a new card into learning and logs the review", () => {
    const { fsrs, log } = rateCard(newCardFsrs(now), Rating.Good, now);
    expect(fsrs.state).toBe(State.Learning);
    expect(fsrs.reps).toBe(1);
    expect(fsrs.lastReview).toBe("2026-07-11T12:00:00.000Z");
    expect(fsrs.due > "2026-07-11T12:00:00.000Z").toBe(true);
    expect(log.rating).toBe(Rating.Good);
    expect(log.review).toBe("2026-07-11T12:00:00.000Z");
  });

  it("schedules Easy further out than Again", () => {
    const card = newCardFsrs(now);
    const easy = rateCard(card, Rating.Easy, now);
    const again = rateCard(card, Rating.Again, now);
    expect(easy.fsrs.due > again.fsrs.due).toBe(true);
  });

  it("counts a lapse when a review-state card is rated Again", () => {
    let { fsrs } = rateCard(newCardFsrs(now), Rating.Easy, now);
    expect(fsrs.state).toBe(State.Review);
    const later = Temporal.Instant.from(fsrs.due);
    const lapsed = rateCard(fsrs, Rating.Again, later);
    expect(lapsed.fsrs.lapses).toBe(1);
  });
});

describe("previewIntervals", () => {
  it("returns a human interval for every grade", () => {
    const intervals = previewIntervals(newCardFsrs(now), now);
    for (const grade of GRADES) {
      expect(intervals[grade]).toMatch(/^(<1m|\d+(\.\d)?(m|h|d|mo|y))$/);
    }
  });
});
