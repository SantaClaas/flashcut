import { State } from "ts-fsrs";

import { type DbConnection, type Row, type SqlValue, withTransaction } from "./connection";

export const DIRECTIONS = ["forward", "reverse"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** FSRS scheduling state as stored on a card_schedules row (dates as ISO UTC strings). */
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

export interface CardRecord {
  id: number;
  deckId: number;
  front: string;
  back: string;
  createdAt: string;
}

export interface CardListItem extends CardRecord {
  /** Whether the card is also studied back→front (an enabled reverse schedule exists). */
  reverseEnabled: boolean;
}

/** One study queue entry: card content plus the schedule being studied. */
export interface StudyItem extends CardRecord, FsrsColumns {
  direction: Direction;
}

export interface ScheduleRecord extends FsrsColumns {
  cardId: number;
  direction: Direction;
  enabled: boolean;
}

function toCardRecord(row: Row): CardRecord {
  return {
    id: Number(row["id"]),
    deckId: Number(row["deck_id"]),
    front: String(row["front"]),
    back: String(row["back"]),
    createdAt: String(row["created_at"]),
  };
}

function toFsrsColumns(row: Row): FsrsColumns {
  return {
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

function fsrsValues(fsrs: FsrsColumns): SqlValue[] {
  return [
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
  ];
}

const SCHEDULE_INSERT = `
  INSERT INTO card_schedules (
    card_id, direction, enabled,
    due, stability, difficulty, elapsed_days, scheduled_days,
    learning_steps, reps, lapses, state, last_review
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Multi-statement, but not wrapped in a transaction (withTransaction doesn't nest) — the caller
 * owns the transaction.
 */
export async function createCard(
  db: DbConnection,
  deckId: number,
  front: string,
  back: string,
  createdAt: string,
  fsrs: FsrsColumns,
  reverse?: { enabled: boolean; fsrs: FsrsColumns },
): Promise<number> {
  const { lastInsertRowid } = await db.run(
    "INSERT INTO cards (deck_id, front, back, created_at) VALUES (?, ?, ?, ?)",
    deckId,
    front,
    back,
    createdAt,
  );
  const cardId = Number(lastInsertRowid);
  await db.run(SCHEDULE_INSERT, cardId, "forward", 1, ...fsrsValues(fsrs));
  if (reverse) {
    await db.run(
      SCHEDULE_INSERT,
      cardId,
      "reverse",
      reverse.enabled ? 1 : 0,
      ...fsrsValues(reverse.fsrs),
    );
  }
  return cardId;
}

export async function updateCardContent(
  db: DbConnection,
  id: number,
  front: string,
  back: string,
): Promise<void> {
  await db.run("UPDATE cards SET front = ?, back = ? WHERE id = ?", front, back, id);
}

/**
 * Turns back→front study on or off. Disabling keeps the schedule dormant (its progress survives);
 * re-enabling resumes it. `newFsrs` is only used when no reverse schedule exists yet.
 */
export async function setReverseEnabled(
  db: DbConnection,
  cardId: number,
  enabled: boolean,
  newFsrs: FsrsColumns,
): Promise<void> {
  const { changes } = await db.run(
    "UPDATE card_schedules SET enabled = ? WHERE card_id = ? AND direction = 'reverse'",
    enabled ? 1 : 0,
    cardId,
  );
  if (changes === 0 && enabled) {
    await db.run(SCHEDULE_INSERT, cardId, "reverse", 1, ...fsrsValues(newFsrs));
  }
}

export async function updateScheduleFsrs(
  db: DbConnection,
  cardId: number,
  direction: Direction,
  fsrs: FsrsColumns,
): Promise<void> {
  await db.run(
    `UPDATE card_schedules SET
       due = ?, stability = ?, difficulty = ?, elapsed_days = ?, scheduled_days = ?,
       learning_steps = ?, reps = ?, lapses = ?, state = ?, last_review = ?
     WHERE card_id = ? AND direction = ?`,
    ...fsrsValues(fsrs),
    cardId,
    direction,
  );
}

export async function deleteCard(db: DbConnection, id: number): Promise<void> {
  await withTransaction(db, async () => {
    await db.run("DELETE FROM review_logs WHERE card_id = ?", id);
    await db.run("DELETE FROM card_schedules WHERE card_id = ?", id);
    await db.run("DELETE FROM cards WHERE id = ?", id);
  });
}

const CARD_WITH_REVERSE = `
  SELECT c.*, s.enabled AS reverse_enabled
  FROM cards c
  LEFT JOIN card_schedules s ON s.card_id = c.id AND s.direction = 'reverse'`;

function toCardListItem(row: Row): CardListItem {
  return { ...toCardRecord(row), reverseEnabled: Boolean(row["reverse_enabled"]) };
}

export async function getCard(db: DbConnection, id: number): Promise<CardListItem | undefined> {
  const row = await db.get(`${CARD_WITH_REVERSE} WHERE c.id = ?`, id);
  return row && toCardListItem(row);
}

export async function listCards(db: DbConnection, deckId: number): Promise<CardListItem[]> {
  const rows = await db.all(`${CARD_WITH_REVERSE} WHERE c.deck_id = ? ORDER BY c.id DESC`, deckId);
  return rows.map(toCardListItem);
}

export async function getSchedule(
  db: DbConnection,
  cardId: number,
  direction: Direction,
): Promise<FsrsColumns | undefined> {
  const row = await db.get(
    "SELECT * FROM card_schedules WHERE card_id = ? AND direction = ?",
    cardId,
    direction,
  );
  return row && toFsrsColumns(row);
}

/** All schedule rows (enabled and dormant) of a deck's cards, for export. */
export async function listSchedules(db: DbConnection, deckId: number): Promise<ScheduleRecord[]> {
  const rows = await db.all(
    `SELECT s.* FROM card_schedules s
     JOIN cards c ON c.id = s.card_id
     WHERE c.deck_id = ?
     ORDER BY s.card_id, s.direction`,
    deckId,
  );
  return rows.map((row) => ({
    ...toFsrsColumns(row),
    cardId: Number(row["card_id"]),
    direction: String(row["direction"]) as Direction,
    enabled: Boolean(row["enabled"]),
  }));
}

/** Number of study items (enabled schedules) in each FSRS state within a deck. */
export async function deckStateCounts(
  db: DbConnection,
  deckId: number,
): Promise<Record<State, number>> {
  const rows = await db.all(
    `SELECT s.state, COUNT(*) AS count
     FROM card_schedules s
     JOIN cards c ON c.id = s.card_id
     WHERE c.deck_id = ? AND s.enabled = 1
     GROUP BY s.state`,
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

const STUDY_ITEM_SELECT = `
  SELECT c.id, c.deck_id, c.front, c.back, c.created_at, s.direction,
    s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days,
    s.learning_steps, s.reps, s.lapses, s.state, s.last_review
  FROM card_schedules s
  JOIN cards c ON c.id = s.card_id`;

function toStudyItem(row: Row): StudyItem {
  return {
    ...toCardRecord(row),
    ...toFsrsColumns(row),
    direction: String(row["direction"]) as Direction,
  };
}

/**
 * The study queue: schedules due for review, oldest day first but in random order within each day,
 * with up to `newLimit` never-studied items (picked oldest-first, presented in random order) spread
 * evenly through the queue. A card studied in both directions contributes two independent items.
 * The shuffling breaks the replay of the previous session's order (items reviewed back-to-back get
 * due timestamps in that same order) to avoid sequence-memorization effects; the day bucketing
 * still prioritizes a multi-day backlog.
 */
export async function studyQueue(
  db: DbConnection,
  deckId: number,
  nowIso: string,
  newLimit: number,
  rng: () => number = Math.random,
): Promise<StudyItem[]> {
  const dueRows = await db.all(
    `${STUDY_ITEM_SELECT}
     WHERE c.deck_id = ? AND s.enabled = 1 AND s.state != ${State.New} AND s.due <= ?
     ORDER BY s.due`,
    deckId,
    nowIso,
  );
  const freshRows = await db.all(
    `${STUDY_ITEM_SELECT}
     WHERE c.deck_id = ? AND s.enabled = 1 AND s.state = ${State.New}
     ORDER BY c.id, s.direction
     LIMIT ?`,
    deckId,
    newLimit,
  );

  // Shuffle due items within each UTC day (timestamps have a uniform ISO format,
  // so the first 10 chars are the day). Everything here is already due, so the
  // exact time within a day carries no scheduling meaning.
  const due = dueRows.map(toStudyItem);
  const bucketed: StudyItem[] = [];
  for (let start = 0; start < due.length;) {
    const day = due[start]!.due.slice(0, 10);
    let end = start + 1;
    while (end < due.length && due[end]!.due.slice(0, 10) === day) end++;
    bucketed.push(...shuffle(due.slice(start, end), rng));
    start = end;
  }

  return interleave(bucketed, shuffle(freshRows.map(toStudyItem), rng));
}
