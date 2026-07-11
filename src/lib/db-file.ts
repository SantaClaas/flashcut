import { closeDb, DB_FILE, getDb } from "../db/client";
import { downloadBlob } from "./download";

/**
 * Downloads the raw SQLite file from OPFS. The WAL is checkpointed and the
 * connection closed first so the copied file is complete and consistent; the
 * next query lazily reopens the database.
 */
export async function exportDatabaseFile(): Promise<void> {
  const db = await getDb();
  await db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  await closeDb();
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(DB_FILE);
  const file = await handle.getFile();
  const bytes = await file.arrayBuffer();
  const date = Temporal.Now.plainDateISO().toString();
  downloadBlob(new Blob([bytes], { type: "application/vnd.sqlite3" }), `flashcut-${date}.db`);
}

/**
 * Replaces the OPFS database with the given SQLite file and reloads the app.
 * Destructive — callers must confirm with the user first.
 */
export async function importDatabaseFile(file: File): Promise<void> {
  const bytes = await file.arrayBuffer();
  await closeDb();
  const root = await navigator.storage.getDirectory();
  // Drop a stale WAL so it cannot be replayed over the imported file.
  await root.removeEntry(`${DB_FILE}-wal`).catch(() => undefined);
  const handle = await root.getFileHandle(DB_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
  location.reload();
}
