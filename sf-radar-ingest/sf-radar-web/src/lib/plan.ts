import { supabase } from "./supabaseClient";
import type { DashboardEvent, EventLike } from "../types";
import type { TzMode } from "./ics";

/**
 * Live plan storage. The plan is authored in localStorage (offline cache,
 * instant reads) and mirrored to Supabase whenever it is shared/exported so
 * a subscribed calendar feed and a shared link stay current. Supabase is
 * the source of truth for anything shared; localStorage is the fallback.
 *
 * TWO credentials, never one (migration 001/004):
 *  - `slug`     - the PUBLIC read id. It is in the /plan/<slug> share page
 *                 URL and the /feed/<slug>.ics feed URL. Grants READ only,
 *                 via get_plan.
 *  - `editKey`  - the WRITE credential. localStorage only, never in a URL.
 *                 upsert_plan / regenerate_plan / delete_plan check it. Lose
 *                 it and you lose edit access to that plan (the UI says so
 *                 and makes it easy to re-copy).
 *
 * The plans table is closed to PostgREST; every path is a SECURITY DEFINER
 * function, so plans can't be listed or enumerated.
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
const EDIT_KEY_KEY = "sfradar:v1:planEditKey";
const SLUG_RE = /^[A-Za-z0-9_-]{16,64}$/;
const EDIT_KEY_RE = /^[a-f0-9]{32,64}$/;

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

/**
 * Hex string from the platform CSPRNG. Throws rather than falling back to a
 * guessable source (Math.random / Date.now): a weak share/feed id is worse
 * than no link at all - callers surface the failure as a share error.
 */
function randomHex(byteLength: number): string {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Secure random isn't available in this browser, so a share link can't be created.");
  }
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomSlug(): string {
  return randomHex(16); // 128-bit read id, 32 hex chars
}

function randomEditKey(): string {
  return randomHex(24); // 192-bit write credential, 48 hex chars
}

function readLocal(key: string, re: RegExp): string | null {
  try {
    const value = localStorage.getItem(key);
    return value && re.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private browsing - the value still works for this session */
  }
}

/** The plan's existing read slug, or null if it has never been shared. */
export function peekSlug(): string | null {
  return readLocal(SLUG_KEY, SLUG_RE);
}

/** The plan's write credential, or null if absent (never shared, or a
 *  pre-001 plan whose row is now read-only). */
export function peekEditKey(): string | null {
  return readLocal(EDIT_KEY_KEY, EDIT_KEY_RE);
}

export interface PlanIdentity {
  slug: string;
  editKey: string;
  /** True when a pre-001 plan (slug present, no edit key) was replaced with a
   *  fresh slug + key because its old row is no longer writable by us. The old
   *  link still resolves read-only. */
  replacedLegacy: boolean;
}

/**
 * The plan's {slug, editKey}, minting and persisting a pair on first use.
 * A pre-001 plan - slug in localStorage but no edit key - cannot be written
 * anymore (its row's edit_key is the server sentinel), so it is retired and a
 * brand-new identity is minted; the old share link keeps working read-only.
 */
export function getOrCreatePlanIdentity(): PlanIdentity {
  const slug = peekSlug();
  const editKey = peekEditKey();
  if (slug && editKey) return { slug, editKey, replacedLegacy: false };

  const fresh = { slug: randomSlug(), editKey: randomEditKey() };
  writeLocal(SLUG_KEY, fresh.slug);
  writeLocal(EDIT_KEY_KEY, fresh.editKey);
  return { ...fresh, replacedLegacy: Boolean(slug && !editKey) };
}

export interface PlanUpsertInput {
  slug: string;
  editKey: string;
  displayName: string | null;
  tzMode: TzMode;
  startDate: string | null;
  attending: PlanEventSnapshot[];
  logged: PlanLoggedNight[];
}

export async function upsertPlan(input: PlanUpsertInput): Promise<void> {
  const { error } = await supabase.rpc("upsert_plan", {
    p_slug: input.slug,
    p_edit_key: input.editKey,
    p_display_name: input.displayName,
    p_tz_mode: input.tzMode,
    p_start_date: input.startDate,
    p_attending: input.attending,
    p_logged: input.logged,
  });
  if (error) throw error;
}

/**
 * Retire the current share link and mint a new one (for a leaked link). The
 * row keeps its contents; only the slug + edit key rotate. group_members /
 * custom_events follow via ON UPDATE CASCADE. Returns the new read slug.
 */
export async function regeneratePlan(): Promise<string> {
  const oldSlug = peekSlug();
  const oldEditKey = peekEditKey();
  if (!oldSlug || !oldEditKey) {
    throw new Error("No editable share link to regenerate on this device.");
  }
  const newSlug = randomSlug();
  const newEditKey = randomEditKey();
  const { error } = await supabase.rpc("regenerate_plan", {
    p_old_slug: oldSlug,
    p_old_edit_key: oldEditKey,
    p_new_slug: newSlug,
    p_new_edit_key: newEditKey,
  });
  if (error) throw error;
  writeLocal(SLUG_KEY, newSlug);
  writeLocal(EDIT_KEY_KEY, newEditKey);
  return newSlug;
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
  // Google Calendar "add by URL" deep link. The community-proven form is
  // `calendar/render?cid=<webcal:// URL>` - the `webcal:` scheme is what makes
  // Google treat `cid` as an external iCal feed to subscribe to (an `https:`
  // URL there is ambiguous with a base64 Google-calendar id, and the `/r`
  // SPA-router path doesn't reliably trigger the subscribe flow). Our feed
  // URLs contain only query-safe characters, so the value is passed as-is,
  // matching the known-working examples.
  const google = `https://calendar.google.com/calendar/render?cid=${webcal}`;
  return { https, webcal, google, page: `${base}/plan/${slug}` };
}
