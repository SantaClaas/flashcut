import { createSignal } from "solid-js";

import { dbService } from "../db/client";
import { btnDanger, card } from "../lib/ui";

/** Hidden maintenance page — reachable only by typing /wipe, never linked. */
export default function WipePage() {
  const [busy, setBusy] = createSignal(false);

  async function wipe() {
    const confirmed = confirm(
      "Delete ALL decks, cards, and review history stored in this browser? This cannot be undone.",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      localStorage.removeItem("color-scheme");
      // Deletes the database files and reloads every open tab.
      await dbService.wipe();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class={`${card} mx-auto mt-12 max-w-md space-y-4 border-red-300 dark:border-red-900`}>
      <h1 class="text-lg font-semibold text-red-600 dark:text-red-400">Wipe all data</h1>
      <p class="text-sm text-stone-600 dark:text-stone-400">
        Permanently deletes the local database — every deck, card, and review — from this browser
        and reloads all open tabs. Consider exporting a backup from Settings first.
      </p>
      <button class={`${btnDanger} w-full`} disabled={busy()} onClick={() => void wipe()}>
        {busy() ? "Wiping…" : "Wipe all data"}
      </button>
    </div>
  );
}
