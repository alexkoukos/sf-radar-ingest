import { supabase } from "./supabaseClient";
import type { DashboardEvent, EventLike } from "../types";
import type { TzMode } from "./ics";

/**
 * A shared plan is a SNAPSHOT, not a live view. "Share plan" freezes the
 * current Attending picks into a Supabase row (via the create_shared_plan
 * SECURITY DEFINER function - the only write path anon has to that table)
 * keyed by an unguessable 256-bit slug. Editing your plan afterwards does
 * not change an already-shared link; re-share to publish an updated one.
 *
 * Why snapshot over live: the plan lives entirely in this browser's
 * localStorage (see lib/localPlan.ts) and there is no account system. A
 * live view would mean continuously syncing every visitor's local plan up
 * to Supabase on every toggle - a write path and a privacy surface this
 * tool deliberately doesn't have. A snapshot is one write, at share time,
 * and is self-contained: it copies the event details it needs, so it keeps
 * rendering even after those events age out of the events table.
 */

/** Frozen copy of the fields the read-only plan view and the ICS export need. */
export type SharedEventSnapshot = EventLike;

export interface SharedLoggedNight {
  /** LA calendar date, "YYYY-MM-DD" - resolved from the night index at share time. */
  date: string;
  title: string;
  note: string;
}

export interface SharedPlan {
  slug: string;
  created_at: string;
  start_date: string | null;
  attending: SharedEventSnapshot[];
  logged: SharedLoggedNight[];
  /** Populated once plans move to the live model (next stage). */
  display_name?: string | null;
  tz_mode?: TzMode;
}

const SNAPSHOT_KEYS = [
  "api_id",
  "name",
  "url_slug",
  "starts_at",
  "ends_at",
  "is_online",
  "host_name",
  "city",
  "region",
  "sublocality",
  "is_free",
  "price_cents",
  "rsvp_type",
  "category",
  "score",
] as const;

/** Strip a live DashboardEvent down to exactly what the snapshot stores. */
export function toSnapshot(event: DashboardEvent): SharedEventSnapshot {
  const out = {} as Record<string, unknown>;
  for (const key of SNAPSHOT_KEYS) out[key] = event[key];
  return out as SharedEventSnapshot;
}

export async function createSharedPlan(
  attending: SharedEventSnapshot[],
  logged: SharedLoggedNight[],
  startDate: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc("create_shared_plan", {
    p_attending: attending,
    p_logged: logged,
    p_start_date: startDate,
  });
  if (error) throw error;
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("share failed: no slug returned");
  }
  return data;
}

export async function fetchSharedPlan(slug: string): Promise<SharedPlan | null> {
  const { data, error } = await supabase.rpc("get_shared_plan", { p_slug: slug });
  if (error) throw error;
  // A non-SETOF composite RPC returns a single object, but tolerate a
  // one-element array in case PostgREST ever wraps it.
  const row = (Array.isArray(data) ? data[0] : data) as SharedPlan | null | undefined;
  if (!row || !row.slug) return null;
  return {
    slug: row.slug,
    created_at: row.created_at,
    start_date: row.start_date ?? null,
    attending: Array.isArray(row.attending) ? row.attending : [],
    logged: Array.isArray(row.logged) ? row.logged : [],
  };
}
