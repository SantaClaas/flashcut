import { State } from "ts-fsrs";

import { type Direction, type FsrsColumns, updateScheduleFsrs } from "./cards";
import { type DbConnection, withTransaction } from "./connection";

/** A ts-fsrs ReviewLog with dates as ISO UTC strings. */
export interface ReviewLogColumns {
  rating: number;
  state: State;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  review: string;
}

/** Atomically applies a rating: updates the schedule's FSRS state and appends the log. */
export async function recordReview(
  db: DbConnection,
  cardId: number,
  direction: Direction,
  fsrs: FsrsColumns,
  log: ReviewLogColumns,
): Promise<void> {
  await withTransaction(db, async () => {
    await updateScheduleFsrs(db, cardId, direction, fsrs);
    await db.run(
      `INSERT INTO review_logs (
         card_id, direction, rating, state, due, stability, difficulty,
         elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cardId,
      direction,
      log.rating,
      log.state,
      log.due,
      log.stability,
      log.difficulty,
      log.elapsedDays,
      log.lastElapsedDays,
      log.scheduledDays,
      log.learningSteps,
      log.review,
    );
  });
}

/**
 * Instants of all reviews since `sinceIso`, ascending. Day-bucketing happens in the UI (user
 * timezone).
 */
export async function reviewTimesSince(db: DbConnection, sinceIso: string): Promise<string[]> {
  const rows = await db.all(
    "SELECT review FROM review_logs WHERE review >= ? ORDER BY review",
    sinceIso,
  );
  return rows.map((row) => String(row["review"]));
}

export async function totalReviewCount(db: DbConnection): Promise<number> {
  const row = await db.get("SELECT COUNT(*) AS count FROM review_logs");
  return Number(row?.["count"] ?? 0);
}

/** Due instants of all scheduled (non-new, non-dormant) study items, for the forecast chart. */
export async function scheduledDueTimes(db: DbConnection): Promise<string[]> {
  const rows = await db.all(
    `SELECT due FROM card_schedules WHERE enabled = 1 AND state != ${State.New} ORDER BY due`,
  );
  return rows.map((row) => String(row["due"]));
}
