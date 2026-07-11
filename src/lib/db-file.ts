import { dbService } from "../db/client";
import { downloadBlob } from "./download";

/**
 * Downloads the raw SQLite file. The leader tab checkpoints the WAL and briefly closes the database
 * so the copied file is complete and consistent, regardless of which tab initiates the export.
 */
export async function exportDatabaseFile(): Promise<void> {
  const bytes = await dbService.exportFile();
  const date = Temporal.Now.plainDateISO().toString();
  downloadBlob(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/vnd.sqlite3" }),
    `flashcut-${date}.db`,
  );
}

/**
 * Replaces the database with the given SQLite file. The leader tab writes it to OPFS and reloads
 * every tab. Destructive — callers must confirm with the user first.
 */
export async function importDatabaseFile(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await dbService.importFile(bytes);
  // The leader broadcasts a reload; reload explicitly too in case this tab is
  // the leader (a poster does not receive its own broadcast).
  location.reload();
}
