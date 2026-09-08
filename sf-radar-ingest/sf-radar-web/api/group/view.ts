import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GROUP_SLUG_RE } from "../_lib/groupIds.js";
import { GROUP_COOKIE, readCookie, rejectWrongMethod, sendJson } from "../_lib/groupHttp.js";
import { verifyGroupToken } from "../_lib/groupToken.js";
import { adminConfigured, adminRpc } from "../_lib/supabaseAdmin.js";

/**
 * GET /api/group/view?slug=<groupSlug> — the gated read.
 *
 * Requires a valid signed session cookie for that exact group. No cookie, an
 * expired/tampered cookie, or a cookie for a different group => 401 with no
 * group data. Direct anon-key access to the group tables is impossible (RLS,
 * zero policies), so this endpoint is the only read path.
 *
 * The payload comes straight from the group_view() SECURITY DEFINER function,
 * which does the visibility redaction in SQL: `busy` custom events are
 * reduced to { event_id, starts_at, ends_at } and `private` ones are dropped
 * entirely before the row ever leaves Postgres. passphrase_hash / edit_key /
 * feed_token are never in its output.
 */

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (rejectWrongMethod(req, res, "GET")) return;

  const secret = process.env.GROUP_TOKEN_SECRET ?? "";
  if (!adminConfigured() || !secret) {
    sendJson(res, 500, { error: "Group feature is not configured." });
    return;
  }

  const session = verifyGroupToken(readCookie(req, GROUP_COOKIE), secret);
  if (!session) {
    sendJson(res, 401, { error: "Enter the group passphrase first." });
    return;
  }

  const rawSlug = Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug;
  const requestedSlug = typeof rawSlug === "string" ? rawSlug : "";
  if (requestedSlug && !GROUP_SLUG_RE.test(requestedSlug)) {
    sendJson(res, 400, { error: "Invalid group link." });
    return;
  }
  if (requestedSlug && requestedSlug !== session.g) {
    // Single active group: the cookie is for a different group than the one
    // being asked for. Force a re-entry rather than silently showing the
    // cookie's group.
    sendJson(res, 401, { error: "Enter the passphrase for this group." });
    return;
  }

  const view = await adminRpc("group_view", { p_group_slug: session.g });
  if (!view.ok) {
    sendJson(res, 502, { error: "Could not load the group." });
    return;
  }

  const data = view.data as { group?: unknown } | null;
  if (!data || typeof data !== "object" || data.group == null) {
    sendJson(res, 404, { error: "Group not found." });
    return;
  }

  sendJson(res, 200, data);
}
