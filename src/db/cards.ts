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

/**
 * The study queue: cards due for review (oldest due first), followed by up to
 * `newLimit` never-studied cards.
 */
export async function studyQueue(
  db: DbConnection,
  deckId: number,
  nowIso: string,
  newLimit: number,
): Promise<CardRecord[]> {
  const due = await db.all(
    `SELECT * FROM cards
     WHERE deck_id = ? AND state != ${State.New} AND due <= ?
     ORDER BY due`,
    deckId,
    nowIso,
  );
  const fresh = await db.all(
    `SELECT * FROM cards
     WHERE deck_id = ? AND state = ${State.New}
     ORDER BY id
     LIMIT ?`,
    deckId,
    newLimit,
  );
  return [...due, ...fresh].map(toCardRecord);
}
