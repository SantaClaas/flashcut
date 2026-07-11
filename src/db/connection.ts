export type SqlValue = string | number | bigint | null | Uint8Array;
export type Row = Record<string, SqlValue>;

/**
 * The subset of the Turso database API used by the repositories. Both
 * `@tursodatabase/database-wasm` (browser) and `@tursodatabase/database`
 * (Node, used in tests) satisfy this interface.
 */
export interface DbConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: SqlValue[]): Promise<{ changes: number; lastInsertRowid: number }>;
  get(sql: string, ...params: SqlValue[]): Promise<Row | undefined>;
  all(sql: string, ...params: SqlValue[]): Promise<Row[]>;
  close(): Promise<void>;
}

/** Runs `fn` inside a transaction, rolling back on failure. */
export async function withTransaction<T>(db: DbConnection, fn: () => Promise<T>): Promise<T> {
  await db.exec("BEGIN");
  try {
    const result = await fn();
    await db.exec("COMMIT");
    return result;
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}
