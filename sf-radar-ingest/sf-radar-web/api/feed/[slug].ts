import type { VercelRequest, VercelResponse } from "@vercel/node";
import { planFeedIcs } from "../_lib/planFeed.js";

/**
 * Live calendar feed for a plan: GET /feed/<slug>.ics -> text/calendar built
 * from the current plans row. Subscribe-able from Google/Apple/Outlook; a
 * subscribed calendar re-polls it (Google every ~8-24h, outside our
 * control) and picks up edits. Un-attended events are simply omitted, so
 * they drop out of the subscriber's calendar on the next poll.
 *
 * Anonymous: reads via the get_plan SECURITY DEFINER RPC with the public
 * anon key. The RPC is the whole read surface - a slug is required and
 * plans can't be listed. All response shaping is in ../../src/lib/planFeed
 * (pure, unit-tested); this file only does routing + the one fetch.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
const SLUG_RE = /^[A-Za-z0-9_-]{16,64}$/;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    const rawSlug = Array.isArray(req.query.slug) ? req.query.slug[0] : (req.query.slug ?? "");
    const slug = String(rawSlug).replace(/\.ics$/i, "");

    if (!SLUG_RE.test(slug)) {
      sendText(res, 400, "Bad plan id.");
      return;
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      sendText(res, 500, "Feed is not configured.");
      return;
    }

    let rpcData: unknown = null;
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
      if (!response.ok) {
        sendText(res, 502, "Could not reach the plan store.");
        return;
      }
      rpcData = await response.json();
    } catch {
      sendText(res, 502, "Could not reach the plan store.");
      return;
    }

    const result = planFeedIcs(rpcData);
    if (result.status !== 200) {
      sendText(res, result.status, result.body);
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
    // Short edge cache: shields the function from poll storms without
    // pretending the feed is fresher than Google's own ~8-24h refresh.
    res.setHeader("Cache-Control", "public, max-age=900, s-maxage=900");
    res.send(result.body);
  } catch (err) {
    console.error("feed handler failed:", err);
    try {
      sendText(res, 500, "Feed error.");
    } catch {
      /* response already dispatched */
    }
  }
}

function sendText(res: VercelResponse, status: number, body: string): void {
  res.status(status);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(body);
}
