import type { VercelRequest, VercelResponse } from "@vercel/node";
import { joinErrorToHttp, validateJoin } from "../_lib/groupCore.js";
import { randomFeedToken } from "../_lib/groupIds.js";
import {
  GROUP_COOKIE,
  readCookie,
  readJsonBody,
  rejectWrongMethod,
  sendJson,
  setGroupCookie,
} from "../_lib/groupHttp.js";
import { DEFAULT_TTL_SECONDS, makeGroupToken, verifyGroupToken } from "../_lib/groupToken.js";
import { adminConfigured, adminRpc, verifyPlanOwnership } from "../_lib/supabaseAdmin.js";

/**
 * POST /api/group/join — a visitor who has already passed the passphrase gate
 * (valid session cookie) claims a name and adds their own plan to the group.
 *
 * Body: { planSlug, editKey, displayName }. The plan must already exist —
 * the client publishes it via upsert_plan first; this endpoint never creates
 * plans. The group is taken from the COOKIE, never the body.
 *
 * Authorisation to attach the plan is the plan's own edit key (verified here);
 * join_group is passed only the slug + name and never a member id. join_group
 * also self-rate-limits per group. Palette colour is assigned by join order,
 * race-safe under an advisory lock, inside join_group.
 */

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (rejectWrongMethod(req, res, "POST")) return;

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

  const parsed = validateJoin(readJsonBody(req));
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  const input = parsed.value;

  if (!(await verifyPlanOwnership(input.planSlug, input.editKey))) {
    sendJson(res, 403, { error: "That plan slug and edit key don't match." });
    return;
  }

  const feedToken = randomFeedToken();
  const joined = await adminRpc("join_group", {
    p_group_slug: session.g,
    p_plan_slug: input.planSlug,
    p_display_name: input.displayName,
    p_feed_token: feedToken,
  });

  if (!joined.ok) {
    const mapped = joinErrorToHttp(joined.error);
    sendJson(res, mapped.status, { error: mapped.error });
    return;
  }

  const row = Array.isArray(joined.data) ? (joined.data[0] as Record<string, unknown>) : null;
  const color = row && typeof row.color === "string" ? row.color : null;
  const joinOrder = row && typeof row.join_order === "number" ? row.join_order : null;

  // Slide the 30-day window forward now that they're a full member.
  setGroupCookie(res, makeGroupToken(session.g, secret), DEFAULT_TTL_SECONDS);
  sendJson(res, 200, { groupSlug: session.g, feedToken, color, joinOrder });
}
