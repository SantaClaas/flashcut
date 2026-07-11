import type { DbConnection } from "./connection";

// Append-only list; each entry bumps PRAGMA user_version by one.
// Timestamps are ISO-8601 UTC instants (Temporal.Instant.toString()), which
// sort correctly as text. FSRS columns on `cards` mirror the ts-fsrs `Card`
// type; `review_logs` mirrors ts-fsrs `ReviewLog`. Deletes cascade in the
// repositories rather than relying on foreign key enforcement.
const MIGRATIONS: readonly string[] = [
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
