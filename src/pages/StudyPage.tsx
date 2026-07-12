import { A, useParams } from "@solidjs/router";
import { createMemo, createSignal, For, onSettled, refresh, Show } from "solid-js";
import { type Grade, State } from "ts-fsrs";

import { Markdown } from "../components/Markdown";
import { deckStateCounts, studyQueue } from "../db/cards";
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

async function fetchStateCounts(deckId: number) {
  const db = await getDb();
  return deckStateCounts(db, deckId);
}

export default function StudyPage() {
  const params = useParams();
  const deckId = () => Number(params["id"]);
  const deck = createMemo(() => fetchDeck(deckId()));
  const queue = createMemo(() => fetchQueue(deckId()));
  const stateCounts = createMemo(() => fetchStateCounts(deckId()));

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
      refresh(stateCounts);
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

      <StateBar counts={stateCounts()} />

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
              <div class="mx-auto max-w-3xl pt-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
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

const STATE_LABELS: Record<State, string> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};
const BAR_STATES = [State.New, State.Learning, State.Relearning, State.Review];

/** One segment per FSRS state, sized by its share of the deck's cards. */
function StateBar(props: { counts: Record<State, number> }) {
  const total = () => BAR_STATES.reduce((sum, state) => sum + props.counts[state], 0);
  return (
    <Show when={total() > 0}>
      <div class="space-y-1.5">
        <div
          class="flex h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
          aria-hidden="true"
        >
          <For each={BAR_STATES}>
            {(state) => (
              <div
                class="state-swatch"
                data-state={state}
                style={{ width: `${(props.counts[state] / total()) * 100}%` }}
              />
            )}
          </For>
        </div>
        <p class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
          <For each={BAR_STATES.filter((state) => props.counts[state] > 0)}>
            {(state) => (
              <span class="flex items-center gap-1.5">
                <span
                  class="state-swatch size-2 rounded-full"
                  aria-hidden="true"
                  data-state={state}
                />
                {props.counts[state]} {STATE_LABELS[state]}
              </span>
            )}
          </For>
        </p>
      </div>
    </Show>
  );
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
