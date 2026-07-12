import { createMemo, createSignal, For, refresh, Show } from "solid-js";

import { ConfirmDialog } from "../components/ConfirmDialog";
import { getDb } from "../db/client";
import { listDecks } from "../db/decks";
import { broadcastMessage, useBroadcast } from "../lib/broadcast";
import { exportDatabaseFile, importDatabaseFile } from "../lib/db-file";
import { exportDeckJson, importDeckJson } from "../lib/deck-json";
import { downloadBlob } from "../lib/download";
import { STARTER_DECKS } from "../lib/starter-decks";
import { isoNow } from "../lib/time";
import {
  COLOR_SCHEMES,
  type ColorScheme,
  colorScheme,
  setColorScheme,
} from "../stores/color-scheme";
import { FONT_SIZES, type FontSize, fontSize, setFontSize } from "../stores/font-size";
import { checkForUpdate } from "../stores/sw-update";

const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  "x-large": "Extra large",
};

async function fetchDecks() {
  const db = await getDb();
  return listDecks(db, isoNow());
}

/** Build instant formatted as a local date/time, e.g. "Jul 11, 2026, 10:15 PM". */
function builtAt(): string {
  return Temporal.Instant.from(__BUILD_TIME__)
    .toZonedDateTimeISO(Temporal.Now.timeZoneId())
    .toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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

  async function addStarterDeck(url: string, name: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not load deck (HTTP ${response.status})`);
      const data: unknown = await response.json();
      const db = await getDb();
      await importDeckJson(db, data);
      refresh(decks);
      broadcastMessage({ type: "Decks changed" });
      setStatus(`Added “${name}” to your decks.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function checkUpdates() {
    setStatus("Checking for updates…");
    try {
      const found = await checkForUpdate();
      setStatus(found ? "Update ready — use the reload prompt to apply it." : "You're up to date.");
    } catch {
      setStatus("Couldn't check for updates — are you offline?");
    }
  }

  // The replace-all-data warning lives in the ConfirmDialog below; by the
  // time a file is picked the user has already confirmed.
  async function importDb(file: File) {
    try {
      await importDatabaseFile(file);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  let dbFileInput: HTMLInputElement | undefined;

  return (
    <div class="space-y-6">
      <section class="card">
        <h2 class="text-sm font-semibold">Appearance</h2>
        <div class="mt-3 flex items-center justify-between gap-4">
          <label class="text-sm text-stone-600 dark:text-stone-400" for="color-scheme">
            Color scheme
          </label>
          <select
            id="color-scheme"
            class="input max-w-40"
            onInput={(event) => setColorScheme(event.currentTarget.value as ColorScheme)}
          >
            <For each={COLOR_SCHEMES}>
              {(scheme) => (
                <option value={scheme} selected={scheme === colorScheme()}>
                  {COLOR_SCHEME_LABELS[scheme]}
                </option>
              )}
            </For>
          </select>
        </div>
        <div class="mt-3 flex items-center justify-between gap-4">
          <label class="text-sm text-stone-600 dark:text-stone-400" for="font-size">
            Font size
          </label>
          <select
            id="font-size"
            class="input max-w-40"
            onInput={(event) => setFontSize(event.currentTarget.value as FontSize)}
          >
            <For each={FONT_SIZES}>
              {(size) => (
                <option value={size} selected={size === fontSize()}>
                  {FONT_SIZE_LABELS[size]}
                </option>
              )}
            </For>
          </select>
        </div>
      </section>

      <section class="card space-y-3">
        <h2 class="text-sm font-semibold">Decks (JSON)</h2>
        <p class="text-sm text-stone-600 dark:text-stone-400">
          Share or back up a single deck, including its scheduling state. Review history is not
          included — use the database export below for a full backup.
        </p>
        <Show when={decks().length}>
          <div class="flex gap-2">
            <select
              class="input"
              onInput={(event) => setSelectedDeckId(Number(event.currentTarget.value))}
            >
              <For each={decks()}>{(deck) => <option value={deck.id}>{deck.name}</option>}</For>
            </select>
            <button class="btn-primary" onClick={exportDeck}>
              Export
            </button>
          </div>
        </Show>
        <FilePicker label="Import deck from JSON…" accept=".json" onFile={importDeck} />
      </section>

      <section class="card space-y-3">
        <h2 class="text-sm font-semibold">Deck library</h2>
        <p class="text-sm text-stone-600 dark:text-stone-400">
          Ready-made decks bundled with Flashcut. Add one to your decks or download it as a file to
          share.
        </p>
        <ul class="space-y-3">
          <For each={STARTER_DECKS}>
            {(starter) => (
              <li class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="text-sm font-medium">
                    {starter.name}{" "}
                    <span class="font-normal text-stone-500">({starter.cardCount} cards)</span>
                  </p>
                  <p class="mt-0.5 text-xs text-stone-500">{starter.description}</p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button
                    class="btn-primary"
                    onClick={() => void addStarterDeck(starter.url, starter.name)}
                  >
                    Add
                  </button>
                  <a class="btn-ghost" href={starter.url} download>
                    Download
                  </a>
                </div>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="card space-y-3">
        <h2 class="text-sm font-semibold">Database (SQLite)</h2>
        <p class="text-sm text-stone-600 dark:text-stone-400">
          Everything lives in a single SQLite file in your browser's origin-private file system.
          Export it as a full backup — importing one replaces all current data.
        </p>
        <div class="flex flex-wrap gap-2">
          <button class="btn-primary" onClick={() => void exportDatabaseFile()}>
            Export database
          </button>
          <input
            ref={(el) => {
              dbFileInput = el;
            }}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            class="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importDb(file);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            class="btn-ghost"
            commandfor="confirm-import-db"
            command="show-modal"
          >
            Import database…
          </button>
        </div>
        <ConfirmDialog
          id="confirm-import-db"
          title="Replace all data?"
          confirmLabel="Choose file…"
          onConfirm={() => dbFileInput?.click()}
        >
          Importing a database file replaces all current decks, cards, and review history.
        </ConfirmDialog>
      </section>

      <Show when={status()}>
        <p class="text-sm text-teal-700 dark:text-teal-400">{status()}</p>
      </Show>

      <p class="text-center text-xs text-stone-500">
        Flashcut {__APP_VERSION__} · build <span class="font-mono">{__GIT_COMMIT__}</span> ·{" "}
        {builtAt()}
      </p>
      <p class="text-center">
        <button class="btn-ghost text-xs" onClick={() => void checkUpdates()}>
          Check for updates
        </button>
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
      <button type="button" class="btn-ghost" onClick={() => fileInput?.click()}>
        {props.label}
      </button>
    </>
  );
}
