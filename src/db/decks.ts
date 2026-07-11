import { State } from "ts-fsrs";

import { type DbConnection, type Row, withTransaction } from "./connection";

export interface Deck {
  id: number;
  name: string;
  description: string;
  createdAt: string;
}

export interface DeckSummary extends Deck {
  totalCount: number;
  newCount: number;
  dueCount: number;
}

function toDeck(row: Row): Deck {
  return {
    id: Number(row["id"]),
    name: String(row["name"]),
    description: String(row["description"]),
    createdAt: String(row["created_at"]),
  };
}

export async function listDecks(db: DbConnection, nowIso: string): Promise<DeckSummary[]> {
  const rows = await db.all(
    `SELECT d.*,
       (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS total_count,
       (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.state = ${State.New}) AS new_count,
       (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.state != ${State.New} AND c.due <= ?) AS due_count
     FROM decks d
     ORDER BY d.name`,
    nowIso,
  );
  return rows.map((row) => ({
    ...toDeck(row),
    totalCount: Number(row["total_count"]),
    newCount: Number(row["new_count"]),
    dueCount: Number(row["due_count"]),
  }));
}

export async function getDeck(db: DbConnection, id: number): Promise<Deck | undefined> {
  const row = await db.get("SELECT * FROM decks WHERE id = ?", id);
  return row && toDeck(row);
}

export async function createDeck(
  db: DbConnection,
  name: string,
  description: string,
  nowIso: string,
): Promise<number> {
  const { lastInsertRowid } = await db.run(
    "INSERT INTO decks (name, description, created_at) VALUES (?, ?, ?)",
    name,
    description,
    nowIso,
  );
  return Number(lastInsertRowid);
}

export async function updateDeck(
  db: DbConnection,
  id: number,
  name: string,
  description: string,
): Promise<void> {
  await db.run("UPDATE decks SET name = ?, description = ? WHERE id = ?", name, description, id);
}

/** Deletes the deck plus its cards and their review logs. */
export async function deleteDeck(db: DbConnection, id: number): Promise<void> {
  await withTransaction(db, async () => {
    await db.run(
      "DELETE FROM review_logs WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)",
      id,
    );
    await db.run("DELETE FROM cards WHERE deck_id = ?", id);
    await db.run("DELETE FROM decks WHERE id = ?", id);
  });
}
