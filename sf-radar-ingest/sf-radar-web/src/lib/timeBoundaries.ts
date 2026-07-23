import { supabase } from "./supabaseClient";

const WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Night {
  index: number;
  /** Inclusive lower bound, exclusive upper bound - both absolute instants. */
  start: Date;
  end: Date;
}

/**
 * Builds the 14 night buckets anchored to Postgres's la_window_start()
 * (today's midnight in America/Los_Angeles), never the browser's
 * timezone. Only the anchor point comes from Postgres; everything after
 * that is fixed-duration instant arithmetic (start + i*24h), which is
 * timezone-agnostic by construction - comparing two absolute instants
 * gives the same answer everywhere, unlike extracting local date parts.
 *
 * Known limitation: this uses exactly-24h steps rather than Postgres's
 * DST-aware `interval '1 day'` arithmetic (schema.sql is frozen this
 * weekend, so a SQL-side boundary function isn't an option). That's a
 * potential 1-hour skew only on the two US DST-transition days a year -
 * irrelevant for this July demo, but worth knowing if this code survives
 * past this weekend.
 */
export async function fetchNightBoundaries(): Promise<Night[]> {
  const { data, error } = await supabase.rpc("la_window_start");
  if (error) throw error;

  const todayStart = new Date(data as string).getTime();
  return Array.from({ length: WINDOW_DAYS }, (_, index) => ({
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
