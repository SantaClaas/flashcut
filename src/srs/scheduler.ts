import { createEmptyCard, fsrs, generatorParameters, Rating, type Grade } from "ts-fsrs";

import type { FsrsColumns } from "../db/cards";
import type { ReviewLogColumns } from "../db/reviews";
import { formatDistance } from "../lib/time";
import { columnsToFsrsCard, fsrsCardToColumns, instantToDate, reviewLogToColumns } from "./mapping";

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export const GRADES: readonly Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export const GRADE_LABELS: Record<Grade, string> = {
  [Rating.Again]: "Again",
  [Rating.Hard]: "Hard",
  [Rating.Good]: "Good",
  [Rating.Easy]: "Easy",
};

/** FSRS state for a brand-new card. */
export function newCardFsrs(now: Temporal.Instant): FsrsColumns {
  return fsrsCardToColumns(createEmptyCard(instantToDate(now)));
}

/** Applies a grade, returning the card's next FSRS state and the review log entry. */
export function rateCard(
  columns: FsrsColumns,
  grade: Grade,
  now: Temporal.Instant,
): { fsrs: FsrsColumns; log: ReviewLogColumns } {
  const { card, log } = scheduler.next(columnsToFsrsCard(columns), instantToDate(now), grade);
  return { fsrs: fsrsCardToColumns(card), log: reviewLogToColumns(log) };
}

/** Predicted next-due distance per grade ("10m", "3d", …) for the rating buttons. */
export function previewIntervals(
  columns: FsrsColumns,
  now: Temporal.Instant,
): Record<Grade, string> {
  const preview = scheduler.repeat(columnsToFsrsCard(columns), instantToDate(now));
  const result = {} as Record<Grade, string>;
  for (const grade of GRADES) {
    const due = Temporal.Instant.fromEpochMilliseconds(preview[grade].card.due.getTime());
    result[grade] = formatDistance(now, due);
  }
  return result;
}
