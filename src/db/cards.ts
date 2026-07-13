import { State } from "ts-fsrs";

import { type DbConnection, type Row, withTransaction } from "./connection";

/** FSRS scheduling state as stored on a card row (dates as ISO UTC strings). */
export interface FsrsColumns {
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: State;
  lastReview: string | null;
}

export interface CardRecord extends FsrsColumns {
  id: number;
  deckId: number;
  front: string;
  back: string;
  createdAt: string;
}

export function toCardRecord(row: Row): CardRecord {
  return {
    id: Number(row["id"]),
    deckId: Number(row["deck_id"]),
    front: String(row["front"]),
    back: String(row["back"]),
    createdAt: String(row["created_at"]),
    due: String(row["due"]),
    stability: Number(row["stability"]),
    difficulty: Number(row["difficulty"]),
    elapsedDays: Number(row["elapsed_days"]),
    scheduledDays: Number(row["scheduled_days"]),
    learningSteps: Number(row["learning_steps"]),
    reps: Number(row["reps"]),
    lapses: Number(row["lapses"]),
    state: Number(row["state"]) as State,
    lastReview: row["last_review"] == null ? null : String(row["last_review"]),
  };
}

export async function createCard(
  db: DbConnection,
  deckId: number,
  front: string,
  back: string,
  createdAt: string,
  fsrs: FsrsColumns,
): Promise<number> {
  const { lastInsertRowid } = await db.run(
    `INSERT INTO cards (
       deck_id, front, back, created_at,
       due, stability, difficulty, elapsed_days, scheduled_days,
       learning_steps, reps, lapses, state, last_review
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    deckId,
    front,
    back,
    createdAt,
    fsrs.due,
    fsrs.stability,
    fsrs.difficulty,
    fsrs.elapsedDays,
    fsrs.scheduledDays,
    fsrs.learningSteps,
    fsrs.reps,
    fsrs.lapses,
    fsrs.state,
    fsrs.lastReview,
  );
  return Number(lastInsertRowid);
}

export async function updateCardContent(
  db: DbConnection,
  id: number,
  front: string,
  back: string,
): Promise<void> {
  await db.run("UPDATE cards SET front = ?, back = ? WHERE id = ?", front, back, id);
}

export async function updateCardFsrs(
  db: DbConnection,
  id: number,
  fsrs: FsrsColumns,
): Promise<void> {
  await db.run(
    `UPDATE cards SET
       due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
       learning_steps = ?, reps = ?, lapses = ?, state = ?, last_review = ?
     WHERE id = ?`,
    fsrs.due,
    fsrs.stability,
    fsrs.difficulty,
    fsrs.elapsedDays,
    fsrs.scheduledDays,
    fsrs.learningSteps,
    fsrs.reps,
    fsrs.lapses,
    fsrs.state,
    fsrs.lastReview,
    id,
  );
}

export async function deleteCard(db: DbConnection, id: number): Promise<void> {
  await withTransaction(db, async () => {
    await db.run("DELETE FROM review_logs WHERE card_id = ?", id);
    await db.run("DELETE FROM cards WHERE id = ?", id);
  });
}

export async function getCard(db: DbConnection, id: number): Promise<CardRecord | undefined> {
  const row = await db.get("SELECT * FROM cards WHERE id = ?", id);
  return row && toCardRecord(row);
}

export async function listCards(db: DbConnection, deckId: number): Promise<CardRecord[]> {
  const rows = await db.all("SELECT * FROM cards WHERE deck_id = ? ORDER BY id DESC", deckId);
  return rows.map(toCardRecord);
}

/** Number of cards in each FSRS state within a deck. */
export async function deckStateCounts(
  db: DbConnection,
  deckId: number,
): Promise<Record<State, number>> {
  const rows = await db.all(
    "SELECT state, COUNT(*) AS count FROM cards WHERE deck_id = ? GROUP BY state",
    deckId,
  );
  const counts: Record<State, number> = {
    [State.New]: 0,
    [State.Learning]: 0,
    [State.Review]: 0,
    [State.Relearning]: 0,
  };
  for (const row of rows) counts[Number(row["state"]) as State] = Number(row["count"]);
  return counts;
}

/** In-place Fisher-Yates shuffle. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return items;
}

/** Merge `secondary` evenly into `primary`, preserving each list's order. */
function interleave<T>(primary: T[], secondary: T[]): T[] {
  const result: T[] = [];
  let p = 0;
  let s = 0;
  while (p < primary.length || s < secondary.length) {
    const takePrimary =
      s >= secondary.length ||
      (p < primary.length && (p + 1) * secondary.length <= (s + 1) * primary.length);
    result.push(takePrimary ? primary[p++]! : secondary[s++]!);
  }
  return result;
}

/**
 * The study queue: cards due for review, oldest day first but in random order within
 * each day, with up to `newLimit` never-studied cards (picked oldest-first, presented
 * in random order) spread evenly through the queue. The shuffling breaks the replay
 * of the previous session's order (cards reviewed back-to-back get due timestamps in
 * that same order) to avoid sequence-memorization effects; the day bucketing still
 * prioritizes a multi-day backlog.
 */
export async function studyQueue(
  db: DbConnection,
  deckId: number,
  nowIso: string,
  newLimit: number,
  rng: () => number = Math.random,
): Promise<CardRecord[]> {
  const dueRows = await db.all(
    `SELECT * FROM cards
     WHERE deck_id = ? AND state != ${State.New} AND due <= ?
     ORDER BY due`,
    deckId,
    nowIso,
  );
  const freshRows = await db.all(
    `SELECT * FROM cards
     WHERE deck_id = ? AND state = ${State.New}
     ORDER BY id
     LIMIT ?`,
    deckId,
    newLimit,
  );

  // Shuffle due cards within each UTC day (timestamps have a uniform ISO format,
  // so the first 10 chars are the day). Everything here is already due, so the
  // exact time within a day carries no scheduling meaning.
  const due = dueRows.map(toCardRecord);
  const bucketed: CardRecord[] = [];
  for (let start = 0; start < due.length; ) {
    const day = due[start]!.due.slice(0, 10);
    let end = start + 1;
    while (end < due.length && due[end]!.due.slice(0, 10) === day) end++;
    bucketed.push(...shuffle(due.slice(start, end), rng));
    start = end;
  }

  return interleave(bucketed, shuffle(freshRows.map(toCardRecord), rng));
}
