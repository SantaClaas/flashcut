import { connect } from "@tursodatabase/database-wasm/vite";

import type { DbConnection } from "./connection";
import { migrate } from "./migrations";

export const DB_FILE = "flashcut.db";

let dbPromise: Promise<DbConnection> | undefined;

/**
 * Lazily opens the OPFS-backed database. Rejects (and stays rejected for
 * retry) when another tab already holds the file lock.
 */
export function getDb(): Promise<DbConnection> {
  dbPromise ??= open().catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

async function open(): Promise<DbConnection> {
  const db = await connect(DB_FILE);
  await migrate(db);
  return db;
}

/** Closes the connection and releases the OPFS lock (used around file import/export). */
export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  if (!pending) return;
  dbPromise = undefined;
  const db = await pending;
  await db.close();
}
