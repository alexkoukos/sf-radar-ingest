import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildPlanIcs, type TzMode } from "../../src/lib/ics";
import { possessivePhrase } from "../../src/lib/possessive";

/**
 * Live calendar feed for a plan: GET /feed/<slug>.ics -> text/calendar built
 * from the current plans row. Subscribe-able from Google/Apple/Outlook; a
 * subscribed calendar re-polls it (Google every ~8-24h, outside our
 * control) and picks up edits. Un-attended events are simply omitted, so
 * they drop out of the subscriber's calendar on the next poll.
 *
 * Anonymous: reads via the get_plan SECURITY DEFINER RPC with the public
 * anon key. The RPC is the whole read surface - a slug is required and
 * plans can't be listed.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
const SLUG_RE = /^[A-Za-z0-9_-]{16,64}$/;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const rawSlug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug ?? "";
  const slug = String(rawSlug).replace(/\.ics$/i, "");

  if (!SLUG_RE.test(slug)) {
    sendText(res, 400, "Bad plan id.");
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    sendText(res, 500, "Feed is not configured.");
    return;
  }

  let plan: Record<string, unknown> | null = null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_plan`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (response.ok) {
      const data = (await response.json()) as unknown;
      plan = Array.isArray(data) ? (data[0] ?? null) : (data as Record<string, unknown> | null);
    }
  } catch {
    sendText(res, 502, "Could not reach the plan store.");
    return;
  }

  if (!plan || typeof plan.slug !== "string") {
    sendText(res, 404, "No plan with that id.");
    return;
  }

  const attending = Array.isArray(plan.attending) ? plan.attending : [];
  const tzMode: TzMode = plan.tz_mode === "floating" ? "floating" : "tzid";
  const displayName = typeof plan.display_name === "string" ? plan.display_name : "";
  const calName = possessivePhrase(displayName, "SF Radar plan");

  const { value } = buildPlanIcs(attending, { tzMode, calName, allowEmpty: true });

  res.status(200);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `inline; filename="${filenameFor(displayName)}"`);
  // Short edge cache: shields the function from poll storms without
  // pretending the feed is fresher than Google's own ~8-24h refresh.
  res.setHeader("Cache-Control", "public, max-age=900, s-maxage=900");
  res.send(value ?? "");
}

function filenameFor(name: string): string {
  const base = name
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base ? `${base}-` : ""}sf-radar-plan.ics`;
}

function sendText(res: VercelResponse, status: number, body: string): void {
  res.status(status);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(body);
}
