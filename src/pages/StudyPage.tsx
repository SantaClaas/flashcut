import { A, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, onSettled, refresh, Show } from "solid-js";
import type { Grade } from "ts-fsrs";

import { Markdown } from "../components/Markdown";
import { studyQueue } from "../db/cards";
import { getDb } from "../db/client";
import { getDeck } from "../db/decks";
import { recordReview } from "../db/reviews";
import { broadcastMessage } from "../lib/broadcast";
import { isoNow } from "../lib/time";
import { GRADE_LABELS, GRADES, previewIntervals, rateCard } from "../srs/scheduler";

const NEW_CARDS_PER_SESSION = 20;

async function fetchQueue(deckId: number) {
  const db = await getDb();
  return studyQueue(db, deckId, isoNow(), NEW_CARDS_PER_SESSION);
}

export default function StudyPage() {
  const params = useParams();
  const deckId = () => Number(params["id"]);
  const deck = createMemo(() => fetchDeck(deckId()));
  const queue = createMemo(() => fetchQueue(deckId()));

  const [index, setIndex] = createSignal(0);
  const [revealed, setRevealed] = createSignal(false);
  const [reviewedCount, setReviewedCount] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  const current = () => queue()[index()];
  const intervals = createMemo(() => {
    const item = current();
    return item && previewIntervals(item, Temporal.Now.instant());
  });

  async function rate(grade: Grade) {
    const item = current();
    if (!item || busy()) return;
    setBusy(true);
    try {
      const { fsrs, log } = rateCard(item, grade, Temporal.Now.instant());
      const db = await getDb();
      await recordReview(db, item.id, fsrs, log);
      // Other tabs refresh their counts/stats; the session queue here stays
      // stable on purpose (no useBroadcast) so the card order doesn't shift.
      broadcastMessage({ type: "Reviews changed", deckId: deckId() });
      setReviewedCount((count) => count + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  function checkForMore() {
    setIndex(0);
    setRevealed(false);
    refresh(queue);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!current()) return;
    if (event.key === " ") {
      event.preventDefault();
      setRevealed(true);
      return;
    }
    if (!revealed()) return;
    const grade = GRADES[Number(event.key) - 1];
    if (grade) void rate(grade);
  }

  onSettled(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between text-sm text-stone-500">
        <A href={`/decks/${deckId()}`} class="hover:text-teal-600">
          ← {deck()?.name ?? "Deck"}
        </A>
        <span>
          {reviewedCount()} reviewed · {Math.max(queue().length - index(), 0)} left
        </span>
      </div>

      <Show
        when={current()}
        fallback={<DoneScreen reviewedCount={reviewedCount()} onCheckForMore={checkForMore} />}
      >
        {(item) => (
          <>
            <div class="card mb-28 space-y-4 p-6">
              <Markdown source={item().front} />
              <Show when={revealed()}>
                <hr class="border-stone-200 dark:border-stone-800" />
                <Markdown source={item().back} />
              </Show>
            </div>

            <div class="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-stone-100/95 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
              <div class="mx-auto max-w-3xl px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <Show
                  when={revealed()}
                  fallback={
                    <button class="btn-primary w-full py-4" onClick={() => setRevealed(true)}>
                      Show answer <span class="opacity-60">(space)</span>
                    </button>
                  }
                >
                  <div class="grid grid-cols-4 gap-2">
                    <For each={GRADES}>
                      {(grade, gradeIndex) => (
                        <button
                          class="grade-btn"
                          data-grade={grade}
                          disabled={busy()}
                          onClick={() => rate(grade)}
                        >
                          <span class="block">
                            {GRADE_LABELS[grade]}{" "}
                            <span class="opacity-60">({gradeIndex() + 1})</span>
                          </span>
                          <span class="block text-xs opacity-75">{intervals()?.[grade]}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}

async function fetchDeck(id: number) {
  const db = await getDb();
  return getDeck(db, id);
}

function DoneScreen(props: { reviewedCount: number; onCheckForMore: () => void }) {
  return (
    <div class="mt-12 space-y-4 text-center">
      <p class="text-4xl" aria-hidden="true">
        🎉
      </p>
      <h1 class="text-lg font-semibold">All caught up!</h1>
      <p class="text-sm text-stone-500">
        You reviewed {props.reviewedCount} {props.reviewedCount === 1 ? "card" : "cards"} this
        session. Cards in learning may become due again in a few minutes.
      </p>
      <div class="flex justify-center gap-2">
        <button class="btn-ghost" onClick={() => props.onCheckForMore()}>
          Check for more
        </button>
        <A href="/" class="btn-primary">
          Back to decks
        </A>
      </div>
    </div>
  );
}
