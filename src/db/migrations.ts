import type { DbConnection } from "./connection";

// Append-only list; each entry bumps PRAGMA user_version by one.
// Timestamps are ISO-8601 UTC instants (Temporal.Instant.toString()), which
// sort correctly as text. FSRS columns on `card_schedules` mirror the ts-fsrs
// `Card` type; `review_logs` mirrors ts-fsrs `ReviewLog`. Deletes cascade in
// the repositories rather than relying on foreign key enforcement.
// Exported for tests (building databases at intermediate versions).
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL REFERENCES decks(id),
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    created_at TEXT NOT NULL,
    due TEXT NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    elapsed_days REAL NOT NULL,
    scheduled_days REAL NOT NULL,
    learning_steps INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    state INTEGER NOT NULL,
    last_review TEXT
  );
  CREATE INDEX idx_cards_deck_state_due ON cards(deck_id, state, due);

  CREATE TABLE review_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id),
    rating INTEGER NOT NULL,
    state INTEGER NOT NULL,
    due TEXT NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    elapsed_days REAL NOT NULL,
    last_elapsed_days REAL NOT NULL,
    scheduled_days REAL NOT NULL,
    learning_steps INTEGER NOT NULL,
    review TEXT NOT NULL
  );
  CREATE INDEX idx_review_logs_card ON review_logs(card_id);
  CREATE INDEX idx_review_logs_review ON review_logs(review);
  `,
  // FSRS state moves off `cards` into one row per study direction, so a card
  // can be learned front→back and back→front on independent schedules. A
  // disabled row is dormant: kept (with its progress) but excluded from study.
  `
  CREATE TABLE card_schedules (
    card_id INTEGER NOT NULL REFERENCES cards(id),
    direction TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    due TEXT NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    elapsed_days REAL NOT NULL,
    scheduled_days REAL NOT NULL,
    learning_steps INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    lapses INTEGER NOT NULL,
    state INTEGER NOT NULL,
    last_review TEXT,
    PRIMARY KEY (card_id, direction)
  );
  CREATE INDEX idx_schedules_state_due ON card_schedules(state, due);

  INSERT INTO card_schedules (card_id, direction, enabled, due, stability, difficulty,
    elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review)
  SELECT id, 'forward', 1, due, stability, difficulty, elapsed_days, scheduled_days,
    learning_steps, reps, lapses, state, last_review FROM cards;

  ALTER TABLE review_logs ADD COLUMN direction TEXT NOT NULL DEFAULT 'forward';

  DROP INDEX idx_cards_deck_state_due;
  ALTER TABLE cards DROP COLUMN due;
  ALTER TABLE cards DROP COLUMN stability;
  ALTER TABLE cards DROP COLUMN difficulty;
  ALTER TABLE cards DROP COLUMN elapsed_days;
  ALTER TABLE cards DROP COLUMN scheduled_days;
  ALTER TABLE cards DROP COLUMN learning_steps;
  ALTER TABLE cards DROP COLUMN reps;
  ALTER TABLE cards DROP COLUMN lapses;
  ALTER TABLE cards DROP COLUMN state;
  ALTER TABLE cards DROP COLUMN last_review;
  `,
];

export async function migrate(db: DbConnection): Promise<void> {
  const row = await db.get("PRAGMA user_version");
  const version = Number(row?.["user_version"] ?? 0);
  for (let v = version; v < MIGRATIONS.length; v++) {
    await db.exec("BEGIN");
    try {
      await db.exec(MIGRATIONS[v]!);
      await db.exec(`PRAGMA user_version = ${v + 1}`);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
}
