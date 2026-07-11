/**
 * Stored timestamps are ISO-8601 UTC with exactly 3 fractional digits
 * (matching Date#toISOString), so lexicographic order == chronological order
 * in SQL string comparisons.
 */
export function toIso(instant: Temporal.Instant): string {
  return instant.toString({ fractionalSecondDigits: 3 });
}

export function isoNow(): string {
  return toIso(Temporal.Now.instant());
}

/** A stored instant as a ZonedDateTime in the user's timezone (for day bucketing). */
export function toLocalZoned(iso: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(Temporal.Now.timeZoneId());
}

/** The local calendar day of a stored instant. */
export function toLocalDay(iso: string): Temporal.PlainDate {
  return toLocalZoned(iso).toPlainDate();
}

/** Compact human distance between two instants: "10m", "3h", "5d", "2mo", "1.5y". */
export function formatDistance(from: Temporal.Instant, to: Temporal.Instant): string {
  const minutes = from.until(to).total({ unit: "minutes" });
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 31) return `${Math.round(days)}d`;
  const months = days / 30.44;
  if (months < 12) return `${Math.round(months)}mo`;
  return `${(days / 365.25).toFixed(1).replace(/\.0$/, "")}y`;
}
