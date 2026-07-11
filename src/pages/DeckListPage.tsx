import { A } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";

import { getDb } from "../db/client";
import { createDeck, deleteDeck, listDecks } from "../db/decks";
import { isoNow } from "../lib/time";
import { btnDanger, btnGhost, btnPrimary, card, input } from "../lib/ui";

async function fetchDecks() {
  const db = await getDb();
  return listDecks(db, isoNow());
}

export default function DeckListPage() {
  const [decks, { refetch }] = createResource(fetchDecks);
  const [name, setName] = createSignal("");

  async function addDeck(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = name().trim();
    if (!trimmed) return;
    const db = await getDb();
    await createDeck(db, trimmed, "", isoNow());
    setName("");
    await refetch();
  }

  async function removeDeck(id: number, deckName: string) {
    if (!confirm(`Delete deck “${deckName}” and all of its cards?`)) return;
    const db = await getDb();
    await deleteDeck(db, id);
    await refetch();
  }

  return (
    <div class="space-y-6">
      <form onSubmit={addDeck} class="flex gap-2">
        <input
          class={input}
          placeholder="New deck name…"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <button type="submit" class={btnPrimary}>
          Create
        </button>
      </form>

      <Show
        when={decks()?.length}
        fallback={
          <p class="mt-12 text-center text-sm text-stone-500">
            No decks yet — create your first one above.
          </p>
        }
      >
        <ul class="space-y-3">
          <For each={decks()}>
            {(deck) => (
              <li class={`${card} flex items-center justify-between gap-4`}>
                <div class="min-w-0">
                  <A href={`/decks/${deck.id}`} class="font-semibold hover:text-teal-600">
                    {deck.name}
                  </A>
                  <p class="mt-1 text-xs text-stone-500">
                    {deck.totalCount} cards
                    <Show when={deck.dueCount > 0}>
                      <span class="ml-2 font-medium text-teal-600 dark:text-teal-400">
                        {deck.dueCount} due
                      </span>
                    </Show>
                    <Show when={deck.newCount > 0}>
                      <span class="ml-2 font-medium text-sky-600 dark:text-sky-400">
                        {deck.newCount} new
                      </span>
                    </Show>
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <A href={`/decks/${deck.id}/study`} class={btnPrimary}>
                    Study
                  </A>
                  <A href={`/decks/${deck.id}`} class={btnGhost}>
                    Browse
                  </A>
                  <button class={btnDanger} onClick={() => removeDeck(deck.id, deck.name)}>
                    Delete
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
