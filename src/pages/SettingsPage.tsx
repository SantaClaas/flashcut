import { createMemo, createSignal, For, refresh, Show } from "solid-js";

import { getDb } from "../db/client";
import { listDecks } from "../db/decks";
import { broadcastMessage, useBroadcast } from "../lib/broadcast";
import { exportDatabaseFile, importDatabaseFile } from "../lib/db-file";
import { exportDeckJson, importDeckJson } from "../lib/deck-json";
import { downloadBlob } from "../lib/download";
import { isoNow } from "../lib/time";
import { btnGhost, btnPrimary, card, input } from "../lib/ui";
import { colorScheme, toggleColorScheme } from "../stores/theme";

async function fetchDecks() {
  const db = await getDb();
  return listDecks(db, isoNow());
}

export default function SettingsPage() {
  const decks = createMemo(() => fetchDecks());
  const [selectedDeckId, setSelectedDeckId] = createSignal<number>();

  useBroadcast((event) => {
    if (event.data.type === "Decks changed") refresh(decks);
  });
  const [status, setStatus] = createSignal("");

  async function exportDeck() {
    const deckId = selectedDeckId() ?? decks()[0]?.id;
    if (deckId == null) return;
    const db = await getDb();
    const data = await exportDeckJson(db, deckId);
    const name = data.deck.name.replace(/[^\w-]+/g, "-").toLowerCase();
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `${name}.flashcut.json`,
    );
  }

  async function importDeck(file: File) {
    try {
      const data: unknown = JSON.parse(await file.text());
      const db = await getDb();
      await importDeckJson(db, data);
      refresh(decks);
      broadcastMessage({ type: "Decks changed" });
      setStatus(`Imported “${file.name}”.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function importDb(file: File) {
    const confirmed = confirm(
      "Importing a database file REPLACES all current decks, cards, and review history. Continue?",
    );
    if (!confirmed) return;
    try {
      await importDatabaseFile(file);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div class="space-y-6">
      <section class={card}>
        <h2 class="text-sm font-semibold">Appearance</h2>
        <div class="mt-3 flex items-center justify-between">
          <p class="text-sm text-stone-600 dark:text-stone-400">
            Color scheme: <span class="font-medium">{colorScheme()}</span>
          </p>
          <button class={btnGhost} onClick={toggleColorScheme}>
            Toggle
          </button>
        </div>
      </section>

      <section class={`${card} space-y-3`}>
        <h2 class="text-sm font-semibold">Decks (JSON)</h2>
        <p class="text-sm text-stone-600 dark:text-stone-400">
          Share or back up a single deck, including its scheduling state. Review history is not
          included — use the database export below for a full backup.
        </p>
        <Show when={decks().length}>
          <div class="flex gap-2">
            <select
              class={input}
              onInput={(event) => setSelectedDeckId(Number(event.currentTarget.value))}
            >
              <For each={decks()}>{(deck) => <option value={deck.id}>{deck.name}</option>}</For>
            </select>
            <button class={btnPrimary} onClick={exportDeck}>
              Export
            </button>
          </div>
        </Show>
        <FilePicker label="Import deck from JSON…" accept=".json" onFile={importDeck} />
      </section>

      <section class={`${card} space-y-3`}>
        <h2 class="text-sm font-semibold">Database (SQLite)</h2>
        <p class="text-sm text-stone-600 dark:text-stone-400">
          Everything lives in a single SQLite file in your browser's origin-private file system.
          Export it as a full backup — importing one replaces all current data.
        </p>
        <div class="flex flex-wrap gap-2">
          <button class={btnPrimary} onClick={() => void exportDatabaseFile()}>
            Export database
          </button>
          <FilePicker label="Import database…" accept=".db,.sqlite,.sqlite3" onFile={importDb} />
        </div>
      </section>

      <Show when={status()}>
        <p class="text-sm text-teal-700 dark:text-teal-400">{status()}</p>
      </Show>

      <p class="text-center text-xs text-stone-500">
        Flashcut {__APP_VERSION__} · build <span class="font-mono">{__GIT_COMMIT__}</span>
      </p>
    </div>
  );
}

function FilePicker(props: { label: string; accept: string; onFile: (file: File) => void }) {
  let fileInput: HTMLInputElement | undefined;
  return (
    <>
      <input
        ref={(el) => {
          fileInput = el;
        }}
        type="file"
        accept={props.accept}
        class="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) props.onFile(file);
          event.currentTarget.value = "";
        }}
      />
      <button type="button" class={btnGhost} onClick={() => fileInput?.click()}>
        {props.label}
      </button>
    </>
  );
}
