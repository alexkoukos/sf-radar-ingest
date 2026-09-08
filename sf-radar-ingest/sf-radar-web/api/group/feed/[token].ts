import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminConfigured, adminRpc, adminSelect } from "../../_lib/supabaseAdmin.js";
import { groupFeedIcs } from "../../_lib/groupFeed.js";

/**
 * Combined group calendar feed: GET /group/feed/<token>.ics
 *
 * One token-bearing, revocable URL per member (any member's token resolves to
 * the whole group). Every member's attending Luma events + their non-private
 * custom events, one VEVENT per (member, event), SUMMARY prefixed "[Member]".
 * A `busy` custom event is "[Member] Busy" with no other detail — the
 * redaction is done in group_feed_by_token(), server-side.
 *
 * The passphrase gate does not apply here (calendar apps can't enter one) —
 * the long random token in the path is the credential, revocable via
 * feed_revoked / rotate_feed_token.
 *
 * Token validity is checked with a direct lookup first, so a valid token for
 * a group whose plans are all currently empty still serves a valid empty
 * calendar (200) rather than a 404.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");

    const raw = Array.isArray(req.query.token) ? req.query.token[0] : (req.query.token ?? "");
    const token = String(raw).replace(/\.ics$/i, "");

    if (!TOKEN_RE.test(token)) {
      sendText(res, 400, "Bad feed token.");
      return;
    }
    if (!adminConfigured()) {
      sendText(res, 500, "Feed is not configured.");
      return;
    }

    // 1. Token valid + not revoked? (also gets us the group name for the empty case)
    const lookup = await adminSelect(
      `group_members?feed_token=eq.${encodeURIComponent(token)}&feed_revoked=eq.false` +
        `&select=group_slug,groups(name)&limit=1`,
    );
    if (!lookup.ok) {
      sendText(res, 502, "Could not reach the group store.");
      return;
    }
    const row = Array.isArray(lookup.data) ? (lookup.data[0] as Record<string, unknown>) : null;
    if (!row) {
      sendText(res, 404, "No group feed for that link (it may have been revoked).");
      return;
    }
    const groupName =
      row.groups && typeof row.groups === "object" && "name" in row.groups
        ? String((row.groups as { name: unknown }).name)
        : "SF Radar group";

    // 2. The feed rows (already visibility-redacted by the RPC).
    const feed = await adminRpc("group_feed_by_token", { p_feed_token: token });
    if (!feed.ok) {
      sendText(res, 502, "Could not build the group feed.");
      return;
    }

    const result = groupFeedIcs(feed.data, groupName);
    if (result.status !== 200) {
      sendText(res, result.status, result.body);
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
    res.setHeader("Cache-Control", "public, max-age=900, s-maxage=900");
    res.send(result.body);
  } catch (err) {
    console.error("group feed handler failed:", err);
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
