import { supabase } from "./supabaseClient";

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface Night {
  index: number;
  /** Inclusive lower bound, exclusive upper bound - both absolute instants. */
  start: Date;
  end: Date;
}

const laDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" for a Date, read as a calendar date in America/Los_Angeles - what the arrival <input type="date"> deals in. */
export function laDateString(date: Date): string {
  return laDateFormatter.format(date);
}

/**
 * Whole-day gap between two "YYYY-MM-DD" strings. Both sides are parsed
 * with Date.UTC purely so the subtraction is exact calendar-day math - this
 * has nothing to do with UTC as a real timezone, it's just a fixed point
 * that cancels out on both sides of the subtraction.
 */
export function daysBetweenDateStrings(fromYMD: string, toYMD: string): number {
  const [fy, fm, fd] = fromYMD.split("-").map(Number);
  const [ty, tm, td] = toYMD.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/**
 * Builds `totalDays` night buckets anchored to Postgres's la_window_start()
 * (today's midnight in America/Los_Angeles), never the browser's
 * timezone. Only the anchor point comes from Postgres; everything after
 * that is fixed-duration instant arithmetic (start + i*24h), which is
 * timezone-agnostic by construction - comparing two absolute instants
 * gives the same answer everywhere, unlike extracting local date parts.
 *
 * `totalDays` is deliberately wider than the 14-night window shown at once
 * (see App.tsx's arrival picker) - one fetch covers every start date the
 * picker can choose, sliced client-side, so the frozen SQL function never
 * needs a second call or a new parameter shape.
 *
 * Known limitation: this uses exactly-24h steps rather than Postgres's
 * DST-aware `interval '1 day'` arithmetic (schema.sql is frozen this
 * weekend, so a SQL-side boundary function isn't an option). That's a
 * potential 1-hour skew only on the two US DST-transition days a year -
 * irrelevant for this July demo, but worth knowing if this code survives
 * past this weekend.
 */
export async function fetchNightBoundaries(totalDays: number): Promise<Night[]> {
  const { data, error } = await supabase.rpc("la_window_start");
  if (error) throw error;

  const todayStart = new Date(data as string).getTime();
  return Array.from({ length: totalDays }, (_, index) => ({
    index,
    start: new Date(todayStart + index * DAY_MS),
    end: new Date(todayStart + (index + 1) * DAY_MS),
  }));
}

export function nightIndexFor(startsAt: string, nights: Night[]): number | null {
  const t = new Date(startsAt).getTime();
  const night = nights.find((n) => t >= n.start.getTime() && t < n.end.getTime());
  return night?.index ?? null;
}
