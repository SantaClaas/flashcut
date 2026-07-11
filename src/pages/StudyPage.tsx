import { A, useParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { Grade } from "ts-fsrs";

import { Markdown } from "../components/Markdown";
import { studyQueue } from "../db/cards";
import { getDb } from "../db/client";
import { getDeck } from "../db/decks";
import { recordReview } from "../db/reviews";
import { isoNow } from "../lib/time";
import { btnGhost, btnPrimary, card } from "../lib/ui";
import { GRADE_LABELS, GRADES, previewIntervals, rateCard } from "../srs/scheduler";

const NEW_CARDS_PER_SESSION = 20;

async function fetchQueue(deckId: number) {
  const db = await getDb();
  return studyQueue(db, deckId, isoNow(), NEW_CARDS_PER_SESSION);
}

export default function StudyPage() {
  const params = useParams();
  const deckId = () => Number(params["id"]);
  const [deck] = createResource(deckId, fetchDeck);
  const [queue, { refetch }] = createResource(deckId, fetchQueue);

  const [index, setIndex] = createSignal(0);
  const [revealed, setRevealed] = createSignal(false);
  const [reviewedCount, setReviewedCount] = createSignal(0);
  const [busy, setBusy] = createSignal(false);

  const current = () => queue()?.[index()];
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
      setReviewedCount((count) => count + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  async function checkForMore() {
    setIndex(0);
    setRevealed(false);
    await refetch();
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

  onMount(() => {
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between text-sm text-stone-500">
        <A href={`/decks/${deckId()}`} class="hover:text-teal-600">
          ← {deck()?.name ?? "Deck"}
        </A>
        <span>
          {reviewedCount()} reviewed · {Math.max((queue()?.length ?? 0) - index(), 0)} left
        </span>
      </div>

      <Show
        when={current()}
        fallback={<DoneScreen reviewedCount={reviewedCount()} onCheckForMore={checkForMore} />}
      >
        {(item) => (
          <div class={`${card} space-y-4 p-6`}>
            <Markdown source={item().front} />
            <Show
              when={revealed()}
              fallback={
                <button class={`${btnPrimary} w-full`} onClick={() => setRevealed(true)}>
                  Show answer <span class="opacity-60">(space)</span>
                </button>
              }
            >
              <hr class="border-stone-200 dark:border-stone-800" />
              <Markdown source={item().back} />
              <div class="grid grid-cols-4 gap-2 pt-2">
                <For each={GRADES}>
                  {(grade, gradeIndex) => (
                    <button
                      class={gradeButtonClass(grade)}
                      disabled={busy()}
                      onClick={() => rate(grade)}
                    >
                      <span class="block">
                        {GRADE_LABELS[grade]} <span class="opacity-60">({gradeIndex() + 1})</span>
                      </span>
                      <span class="block text-xs opacity-75">{intervals()?.[grade]}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
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
        <button class={btnGhost} onClick={() => props.onCheckForMore()}>
          Check for more
        </button>
        <A href="/" class={btnPrimary}>
          Back to decks
        </A>
      </div>
    </div>
  );
}

function gradeButtonClass(grade: Grade): string {
  const base =
    "cursor-pointer rounded-lg px-2 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50";
  const colors: Record<Grade, string> = {
    1: "bg-red-600 hover:bg-red-500",
    2: "bg-amber-600 hover:bg-amber-500",
    3: "bg-teal-600 hover:bg-teal-500",
    4: "bg-sky-600 hover:bg-sky-500",
  };
  return `${base} ${colors[grade]}`;
}
