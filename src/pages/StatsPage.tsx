import { createMemo, createResource, For, Show } from "solid-js";

import { getDb } from "../db/client";
import { reviewTimesSince, scheduledDueTimes, totalReviewCount } from "../db/reviews";
import { toIso, toLocalDay } from "../lib/time";
import { card } from "../lib/ui";

const HISTORY_DAYS = 30;
const FORECAST_DAYS = 14;

async function fetchStats() {
  const db = await getDb();
  const since = Temporal.Now.instant().subtract({ hours: 24 * 366 });
  const [reviews, total, dues] = [
    await reviewTimesSince(db, toIso(since)),
    await totalReviewCount(db),
    await scheduledDueTimes(db),
  ];
  return { reviews, total, dues };
}

/** Consecutive days with at least one review, ending today (or yesterday). */
function currentStreak(reviewDays: Set<string>): number {
  let day = Temporal.Now.plainDateISO();
  if (!reviewDays.has(day.toString())) day = day.subtract({ days: 1 });
  let streak = 0;
  while (reviewDays.has(day.toString())) {
    streak += 1;
    day = day.subtract({ days: 1 });
  }
  return streak;
}

interface DayBucket {
  date: Temporal.PlainDate;
  count: number;
}

function BarChart(props: { days: DayBucket[]; class?: string }) {
  const max = () => Math.max(...props.days.map((d) => d.count), 1);
  return (
    <div class={`flex h-28 items-end gap-1 ${props.class ?? ""}`}>
      <For each={props.days}>
        {(day) => (
          <div
            class="group relative flex-1 rounded-t bg-teal-600/80 transition-colors hover:bg-teal-500 dark:bg-teal-500/70"
            style={{ height: `${(day.count / max()) * 100}%`, "min-height": day.count ? "4px" : "1px" }}
            title={`${day.date.toString()}: ${day.count}`}
          />
        )}
      </For>
    </div>
  );
}

export default function StatsPage() {
  const [stats] = createResource(fetchStats);

  const reviewsByDay = createMemo(() => {
    const byDay = new Map<string, number>();
    for (const iso of stats()?.reviews ?? []) {
      const key = toLocalDay(iso).toString();
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    return byDay;
  });

  const history = createMemo<DayBucket[]>(() => {
    const today = Temporal.Now.plainDateISO();
    return Array.from({ length: HISTORY_DAYS }, (_, offset) => {
      const date = today.subtract({ days: HISTORY_DAYS - 1 - offset });
      return { date, count: reviewsByDay().get(date.toString()) ?? 0 };
    });
  });

  const forecast = createMemo<DayBucket[]>(() => {
    const today = Temporal.Now.plainDateISO();
    const buckets = Array.from({ length: FORECAST_DAYS }, (_, offset) => ({
      date: today.add({ days: offset }),
      count: 0,
    }));
    for (const iso of stats()?.dues ?? []) {
      let day = toLocalDay(iso);
      // Overdue cards count as due today.
      if (Temporal.PlainDate.compare(day, today) < 0) day = today;
      const offset = today.until(day).days;
      if (offset < FORECAST_DAYS) buckets[offset]!.count += 1;
    }
    return buckets;
  });

  const reviewedToday = () => reviewsByDay().get(Temporal.Now.plainDateISO().toString()) ?? 0;

  return (
    <Show when={stats()}>
      <div class="space-y-6">
        <div class="grid grid-cols-3 gap-3">
          <StatTile label="Reviews today" value={reviewedToday()} />
          <StatTile label="Day streak" value={currentStreak(new Set(reviewsByDay().keys()))} />
          <StatTile label="Total reviews" value={stats()!.total} />
        </div>

        <section class={card}>
          <h2 class="mb-4 text-sm font-semibold">Reviews — last {HISTORY_DAYS} days</h2>
          <BarChart days={history()} />
        </section>

        <section class={card}>
          <h2 class="mb-4 text-sm font-semibold">Due forecast — next {FORECAST_DAYS} days</h2>
          <BarChart days={forecast()} />
        </section>
      </div>
    </Show>
  );
}

function StatTile(props: { label: string; value: number }) {
  return (
    <div class={`${card} text-center`}>
      <p class="text-2xl font-bold tabular-nums">{props.value}</p>
      <p class="mt-1 text-xs text-stone-500">{props.label}</p>
    </div>
  );
}
