import { laDateString } from "./timeBoundaries";

/**
 * Calendar-day keys for the month/day pickers. Every event is bucketed by
 * its start time read as an America/Los_Angeles date ("YYYY-MM-DD", via the
 * same explicit-timezone formatter the rest of the app uses), never the
 * browser's zone.
 *
 * Labels are built from the key itself: the key is parsed at UTC noon and
 * formatted with timeZone "UTC", which is fixed-point calendar math, not a
 * timezone conversion, so a viewer in Athens sees the same labels as one
 * in San Francisco.
 */

export function eventDayKey(startsAt: string): string {
  return laDateString(new Date(startsAt));
}

export function todayKey(): string {
  return laDateString(new Date());
}

/** "2026-09-24" -> "2026-09" */
export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

function keyToNoonUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d ?? 1, 12));
}

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
const monthNameFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" });
const weekdayShortFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
const dayLongFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});

/** "2026-09" -> "September 2026" */
export function monthLabel(monthKey: string): string {
  return monthLabelFormatter.format(keyToNoonUtc(monthKey));
}

/** "September" in the current year, "January 2027" otherwise - no year noise when it's obvious. */
export function monthPickerLabel(monthKey: string, today: string): string {
  return monthKey.slice(0, 4) === today.slice(0, 4) ? monthName(monthKey) : monthLabel(monthKey);
}

/** "2026-09" -> "September" */
export function monthName(monthKey: string): string {
  return monthNameFormatter.format(keyToNoonUtc(monthKey));
}

/** "2026-09-24" -> "Thu 24" */
export function dayOptionLabel(dayKey: string): string {
  return `${weekdayShortFormatter.format(keyToNoonUtc(dayKey))} ${Number(dayKey.slice(8, 10))}`;
}

/** "2026-09-24" -> "Thursday, September 24" */
export function dayLongLabel(dayKey: string): string {
  return dayLongFormatter.format(keyToNoonUtc(dayKey));
}
