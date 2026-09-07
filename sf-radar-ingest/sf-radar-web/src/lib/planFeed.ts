import { buildPlanIcs, type TzMode } from "./ics";
import { possessivePhrase } from "./possessive";
import type { EventLike } from "../types";

/**
 * Pure core of the /api/feed/<slug>.ics serverless function: turn whatever
 * get_plan returned into an HTTP response shape. No `fetch`, no req/res - so
 * it is unit-testable against the real RPC payload shape and can never throw
 * an uncaught error into the function runtime.
 *
 * get_plan returns a SETOF row (a one-element array from PostgREST) since
 * migration 004; a missing slug is an empty array. Older callers returned a
 * bare object / an all-null row, so both shapes are tolerated.
 */

export interface PlanFeedResult {
  status: 200 | 404 | 500;
  body: string;
  /** Only set when status === 200. */
  filename?: string;
}

function unwrapRow(rpcData: unknown): Record<string, unknown> | null {
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  return typeof record.slug === "string" && record.slug.length > 0 ? record : null;
}

/** Content-Disposition filename: letters/digits/hyphen only, so no header break. */
export function feedFilename(displayName: string): string {
  const base = displayName
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base ? `${base}-` : ""}sf-radar-plan.ics`;
}

export function planFeedIcs(rpcData: unknown): PlanFeedResult {
  const plan = unwrapRow(rpcData);
  if (!plan) return { status: 404, body: "No plan with that id." };

  try {
    const attending: EventLike[] = Array.isArray(plan.attending)
      ? (plan.attending as EventLike[])
      : [];
    const tzMode: TzMode = plan.tz_mode === "floating" ? "floating" : "tzid";
    const displayName = typeof plan.display_name === "string" ? plan.display_name : "";
    const calName = possessivePhrase(displayName, "SF Radar plan");

    const { value } = buildPlanIcs(attending, { tzMode, calName, allowEmpty: true });
    return { status: 200, body: value ?? "", filename: feedFilename(displayName) };
  } catch {
    // A bad snapshot must degrade to a clean 500, never crash the function
    // (Google/Apple then just retry the poll instead of dropping the feed).
    return { status: 500, body: "Couldn't build the calendar feed." };
  }
}
