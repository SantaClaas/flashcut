import { A, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, refresh, Show } from "solid-js";

import { Markdown } from "../components/Markdown";
import { createCard, deleteCard, listCards, updateCardContent } from "../db/cards";
import { getDb } from "../db/client";
import { getDeck } from "../db/decks";
import { broadcastMessage, useBroadcast } from "../lib/broadcast";
import { isoNow } from "../lib/time";
import { btnDanger, btnGhost, btnPrimary, card, input } from "../lib/ui";
import { newCardFsrs } from "../srs/scheduler";

async function fetchDeck(id: number) {
  const db = await getDb();
  return getDeck(db, id);
}

async function fetchCards(id: number) {
  const db = await getDb();
  return listCards(db, id);
}

export default function DeckPage() {
  const params = useParams();
  const deckId = () => Number(params["id"]);
  const deck = createMemo(() => fetchDeck(deckId()));
  const cards = createMemo(() => fetchCards(deckId()));

  useBroadcast((event) => {
    if (event.data.type === "Decks changed") refresh(deck);
    if (event.data.type === "Cards changed" && event.data.deckId === deckId()) refresh(cards);
  });

  const [front, setFront] = createSignal("");
  const [back, setBack] = createSignal("");
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [showPreview, setShowPreview] = createSignal(false);

  function resetForm() {
    setFront("");
    setBack("");
    setEditingId(null);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!front().trim() || !back().trim()) return;
    const db = await getDb();
    const id = editingId();
    if (id == null) {
      await createCard(
        db,
        deckId(),
        front(),
        back(),
        isoNow(),
        newCardFsrs(Temporal.Now.instant()),
      );
    } else {
      await updateCardContent(db, id, front(), back());
    }
    resetForm();
    refresh(cards);
    broadcastMessage({ type: "Cards changed", deckId: deckId() });
  }

  async function removeCard(id: number) {
    if (!confirm("Delete this card?")) return;
    const db = await getDb();
    await deleteCard(db, id);
    if (editingId() === id) resetForm();
    refresh(cards);
    broadcastMessage({ type: "Cards changed", deckId: deckId() });
  }

  function startEditing(id: number, cardFront: string, cardBack: string) {
    setEditingId(id);
    setFront(cardFront);
    setBack(cardBack);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Show when={deck()} fallback={<p class="text-sm text-stone-500">Deck not found.</p>}>
      <div class="space-y-6">
        <div class="flex items-center justify-between gap-4">
          <h1 class="truncate text-lg font-semibold">{deck()!.name}</h1>
          <A href={`/decks/${deckId()}/study`} class={btnPrimary}>
            Study
          </A>
        </div>

        <form onSubmit={submit} class={`${card} space-y-3`}>
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold">{editingId() == null ? "Add card" : "Edit card"}</h2>
            <label class="flex items-center gap-1.5 text-xs text-stone-500">
              <input
                type="checkbox"
                checked={showPreview()}
                onInput={(event) => setShowPreview(event.currentTarget.checked)}
              />
              Preview
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-2">
              <textarea
                class={`${input} min-h-24 font-mono`}
                placeholder="Front (markdown)"
                value={front()}
                onInput={(event) => setFront(event.currentTarget.value)}
              />
              <Show when={showPreview() && front().trim()}>
                <div class="rounded-lg border border-dashed border-stone-300 p-2 dark:border-stone-700">
                  <Markdown source={front()} />
                </div>
              </Show>
            </div>
            <div class="space-y-2">
              <textarea
                class={`${input} min-h-24 font-mono`}
                placeholder="Back (markdown)"
                value={back()}
                onInput={(event) => setBack(event.currentTarget.value)}
              />
              <Show when={showPreview() && back().trim()}>
                <div class="rounded-lg border border-dashed border-stone-300 p-2 dark:border-stone-700">
                  <Markdown source={back()} />
                </div>
              </Show>
            </div>
          </div>
          <div class="flex gap-2">
            <button type="submit" class={btnPrimary}>
              {editingId() == null ? "Add card" : "Save changes"}
            </button>
            <Show when={editingId() != null}>
              <button type="button" class={btnGhost} onClick={resetForm}>
                Cancel
              </button>
            </Show>
          </div>
        </form>

        <Show
          when={cards().length}
          fallback={<p class="text-center text-sm text-stone-500">No cards in this deck yet.</p>}
        >
          <ul class="space-y-2">
            <For each={cards()}>
              {(item) => (
                <li class={`${card} flex items-start justify-between gap-4`}>
                  <div class="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <Markdown source={item.front} />
                    <Markdown source={item.back} class="text-stone-600 dark:text-stone-400" />
                  </div>
                  <div class="flex shrink-0 gap-1">
                    <button
                      class={btnGhost}
                      onClick={() => startEditing(item.id, item.front, item.back)}
                    >
                      Edit
                    </button>
                    <button class={btnDanger} onClick={() => removeCard(item.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  );
}
