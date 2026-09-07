import { supabase } from "./supabaseClient";
import type { DashboardEvent, EventLike } from "../types";
import type { TzMode } from "./ics";

/**
 * Live plan storage. The plan is authored in localStorage (offline cache,
 * instant reads) and mirrored to Supabase whenever it is shared/exported so
 * a subscribed calendar feed and a shared link stay current. Supabase is
 * the source of truth for anything shared; localStorage is the fallback.
 *
 * The slug is minted once (crypto.randomUUID, 128 bits), kept in
 * localStorage, and is the id for BOTH the /plan/<slug> share page and the
 * /feed/<slug>.ics calendar feed. Reads and writes go only through the
 * get_plan / upsert_plan SECURITY DEFINER functions - the table itself is
 * closed to PostgREST, so plans can't be listed or enumerated.
 */

export type PlanEventSnapshot = EventLike;

export interface PlanLoggedNight {
  /** LA calendar date, "YYYY-MM-DD". */
  date: string;
  title: string;
  note: string;
}

export interface Plan {
  slug: string;
  display_name: string | null;
  tz_mode: TzMode;
  start_date: string | null;
  attending: PlanEventSnapshot[];
  logged: PlanLoggedNight[];
  created_at?: string;
  updated_at?: string;
}

const SLUG_KEY = "sfradar:v1:planSlug";
const SLUG_RE = /^[A-Za-z0-9_-]{16,64}$/;

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

/** Strip a live DashboardEvent down to exactly what a plan row stores. */
export function toSnapshot(event: DashboardEvent): PlanEventSnapshot {
  const out = {} as Record<string, unknown>;
  for (const key of SNAPSHOT_KEYS) out[key] = event[key];
  return out as PlanEventSnapshot;
}

function randomSlug(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random()
          .toString(16)
          .slice(2)}`;
  return uuid.replace(/-/g, "").slice(0, 40);
}

/** The plan's existing slug, or null if it has never been shared. */
export function peekSlug(): string | null {
  try {
    const value = localStorage.getItem(SLUG_KEY);
    return value && SLUG_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** The plan's slug, minting and persisting one on first use. */
export function getOrCreateSlug(): string {
  const existing = peekSlug();
  if (existing) return existing;
  const slug = randomSlug();
  try {
    localStorage.setItem(SLUG_KEY, slug);
  } catch {
    /* private browsing - the slug still works for this session */
  }
  return slug;
}

export interface PlanUpsertInput {
  slug: string;
  displayName: string | null;
  tzMode: TzMode;
  startDate: string | null;
  attending: PlanEventSnapshot[];
  logged: PlanLoggedNight[];
}

export async function upsertPlan(input: PlanUpsertInput): Promise<void> {
  const { error } = await supabase.rpc("upsert_plan", {
    p_slug: input.slug,
    p_display_name: input.displayName,
    p_tz_mode: input.tzMode,
    p_start_date: input.startDate,
    p_attending: input.attending,
    p_logged: input.logged,
  });
  if (error) throw error;
}

export async function fetchPlan(slug: string): Promise<Plan | null> {
  const { data, error } = await supabase.rpc("get_plan", { p_slug: slug });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row.slug !== "string") return null;
  return {
    slug: row.slug,
    display_name: (row.display_name as string | null) ?? null,
    tz_mode: row.tz_mode === "floating" ? "floating" : "tzid",
    start_date: (row.start_date as string | null) ?? null,
    attending: Array.isArray(row.attending) ? (row.attending as PlanEventSnapshot[]) : [],
    logged: Array.isArray(row.logged) ? (row.logged as PlanLoggedNight[]) : [],
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export interface FeedUrls {
  https: string;
  webcal: string;
  google: string;
  page: string;
}

/** The share-page URL and the three feed-subscription URL forms. */
export function feedUrls(slug: string, origin?: string): FeedUrls {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const https = `${base}/feed/${slug}.ics`;
  const webcal = https.replace(/^https?:/i, "webcal:");
  // Google's "add by URL" deep link. It wants an http(s) URL in `cid`.
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(https)}`;
  return { https, webcal, google, page: `${base}/plan/${slug}` };
}
