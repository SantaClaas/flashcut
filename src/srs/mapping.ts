import type { Card, ReviewLog } from "ts-fsrs";

import type { FsrsColumns } from "../db/cards";
import type { ReviewLogColumns } from "../db/reviews";

// ts-fsrs speaks JS Date; the database stores ISO UTC strings and the rest of
// the app speaks Temporal. All conversions live here.

export function instantToDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

// Millisecond precision like lib/time.ts#toIso — stored instants must share
// one format so SQL string comparison orders them correctly.
function dateToIso(date: Date): string {
  return date.toISOString();
}

export function columnsToFsrsCard(columns: FsrsColumns): Card {
  return {
    due: new Date(columns.due),
    stability: columns.stability,
    difficulty: columns.difficulty,
    elapsed_days: columns.elapsedDays,
    scheduled_days: columns.scheduledDays,
    learning_steps: columns.learningSteps,
    reps: columns.reps,
    lapses: columns.lapses,
    state: columns.state,
    ...(columns.lastReview == null ? {} : { last_review: new Date(columns.lastReview) }),
  };
}

export function fsrsCardToColumns(card: Card): FsrsColumns {
  return {
    due: dateToIso(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ? dateToIso(card.last_review) : null,
  };
}

export function reviewLogToColumns(log: ReviewLog): ReviewLogColumns {
  return {
    rating: log.rating,
    state: log.state,
    due: dateToIso(log.due),
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsed_days,
    lastElapsedDays: log.last_elapsed_days,
    scheduledDays: log.scheduled_days,
    learningSteps: log.learning_steps,
    review: dateToIso(log.review),
  };
}
