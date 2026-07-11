import { connect } from "@tursodatabase/database-wasm/vite";

import { consume, provide, ProviderChangedError } from "../lib/broadcast-service";
import type { DbConnection, Row, SqlValue } from "./connection";
import { migrate } from "./migrations";

export const DB_FILE = "flashcut.db";
const LOCK_NAME = "flashcut-db-leader";
const SCOPE = "db";

/**
 * Multi-tab model: the OPFS sync access handle allows only one open database per origin, so tabs
 * elect a leader with the Web Locks API. The leader opens the real database and provides
 * `DbService` over a BroadcastChannel; every other tab proxies its calls to the leader. When the
 * leader tab closes, the lock is released and a surviving tab is promoted seamlessly.
 */
export type DbService = {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<{ changes: number; lastInsertRowid: number }>;
  get(sql: string, params: SqlValue[]): Promise<Row | undefined>;
  all(sql: string, params: SqlValue[]): Promise<Row[]>;
  /** Checkpoints the WAL, briefly closes the database, and returns the raw SQLite file bytes. */
  exportFile(): Promise<Uint8Array>;
  /** Replaces the database file and reloads every tab. Destructive. */
  importFile(bytes: Uint8Array): Promise<void>;
};

const channel = new BroadcastChannel("flashcut-db");
const consumer = consume<DbService>(channel, SCOPE);

let isLeader = false;
let localDb: Promise<DbConnection> | undefined;
let electionStarted = false;

async function open(): Promise<DbConnection> {
  const db = await connect(DB_FILE);
  await migrate(db);
  return db;
}

function getLocal(): Promise<DbConnection> {
  localDb ??= open();
  return localDb;
}

async function readFileBytes(): Promise<Uint8Array> {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(DB_FILE);
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

/** The leader-side implementation working on the locally opened database. */
const localService: DbService = {
  exec: async (sql) => (await getLocal()).exec(sql),
  run: async (sql, params) => (await getLocal()).run(sql, ...params),
  get: async (sql, params) => (await getLocal()).get(sql, ...params),
  all: async (sql, params) => (await getLocal()).all(sql, ...params),

  async exportFile() {
    const db = await getLocal();
    await db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const bytesAfterClose = (async () => {
      await db.close();
      return readFileBytes();
    })();
    // Queue every later call behind the reopen so the closed window stays private.
    localDb = bytesAfterClose.then(open);
    return bytesAfterClose;
  },

  async importFile(bytes) {
    const db = await getLocal();
    await db.close();
    localDb = undefined;
    const root = await navigator.storage.getDirectory();
    // Drop a stale WAL so it cannot be replayed over the imported file.
    await root.removeEntry(`${DB_FILE}-wal`).catch(() => undefined);
    const handle = await root.getFileHandle(DB_FILE, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes as Uint8Array<ArrayBuffer>);
    await writable.close();
    // Every tab must restart on the new data; the poster doesn't receive its
    // own broadcast, so the leader reloads itself explicitly.
    channel.postMessage({ scope: SCOPE, kind: "reload" });
    location.reload();
  },
};

channel.addEventListener("message", (event: MessageEvent<{ scope?: string; kind?: string }>) => {
  if (event.data?.scope === SCOPE && event.data.kind === "reload") location.reload();
});

function startElection(): void {
  if (electionStarted) return;
  electionStarted = true;
  void navigator.locks.request(LOCK_NAME, async () => {
    isLeader = true;
    consumer.handlePromotion();
    await getLocal();
    provide(channel, SCOPE, localService);
    console.debug("[db] acquired leader lock, serving the database");
    // Hold the lock — and with it leadership — until this tab dies.
    await new Promise<never>(() => {});
  });
}

/** Runs `operation` locally when leader, otherwise through the leader tab. */
async function callService<T>(operation: (service: DbService) => Promise<T>): Promise<T> {
  startElection();
  while (true) {
    if (isLeader) return operation(localService);
    try {
      return await operation(consumer.proxy);
    } catch (error) {
      // Promoted mid-wait: the call was never sent, safe to redispatch locally.
      if (error instanceof ProviderChangedError) continue;
      throw error;
    }
  }
}

/** Role-independent `DbService`; use for file export/import. */
export const dbService: DbService = {
  exec: (sql) => callService((service) => service.exec(sql)),
  run: (sql, params) => callService((service) => service.run(sql, params)),
  get: (sql, params) => callService((service) => service.get(sql, params)),
  all: (sql, params) => callService((service) => service.all(sql, params)),
  exportFile: () => callService((service) => service.exportFile()),
  importFile: (bytes) => callService((service) => service.importFile(bytes)),
};

const connection: DbConnection = {
  exec: (sql) => dbService.exec(sql),
  run: (sql, ...params) => dbService.run(sql, params),
  get: (sql, ...params) => dbService.get(sql, params),
  all: (sql, ...params) => dbService.all(sql, params),
  close: () =>
    Promise.reject(
      new Error("The shared database connection cannot be closed; the leader tab manages it."),
    ),
};

/** The database as seen from this tab — local on the leader, proxied elsewhere. */
export function getDb(): Promise<DbConnection> {
  startElection();
  return Promise.resolve(connection);
}
