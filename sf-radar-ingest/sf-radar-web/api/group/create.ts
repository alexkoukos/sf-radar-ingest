import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { validateCreate } from "../_lib/groupCore.js";
import { randomFeedToken, randomGroupSlug } from "../_lib/groupIds.js";
import { clientIp, readJsonBody, rejectWrongMethod, sendJson, setGroupCookie } from "../_lib/groupHttp.js";
import { DEFAULT_TTL_SECONDS, makeGroupToken } from "../_lib/groupToken.js";
import {
  adminConfigured,
  adminDelete,
  adminInsert,
  adminRpc,
  rateAllow,
  verifyPlanOwnership,
} from "../_lib/supabaseAdmin.js";

/**
 * POST /api/group/create — turn the caller's existing standalone plan into a
 * trip group and make them member #1.
 *
 * Body: { planSlug, editKey, name, startDate, endDate, passphrase, displayName }
 *
 * 1. rate-limit per IP
 * 2. verify editKey owns planSlug (fail closed)
 * 3. bcrypt-hash the normalized passphrase (cost 10; the hash never leaves the DB)
 * 4. INSERT the groups row as service role (RLS-bypassing)
 * 5. join_group(...) adopts planSlug as member #1 — on failure, compensating
 *    DELETE of the just-created group so no orphan is left
 * 6. set the signed HttpOnly group-session cookie, return { groupSlug, feedToken, color, joinOrder }
 *
 * The bcrypt cost of 10 matches groups.passphrase_hash's format comment;
 * bcryptjs v3 emits a "$2b$" prefix, which bcrypt.compare reads back fine.
 */

const BCRYPT_COST = 10;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (rejectWrongMethod(req, res, "POST")) return;

  const secret = process.env.GROUP_TOKEN_SECRET ?? "";
  if (!adminConfigured() || !secret) {
    sendJson(res, 500, { error: "Group feature is not configured." });
    return;
  }

  const parsed = validateCreate(readJsonBody(req));
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  const input = parsed.value;

  const ip = clientIp(req);
  if (ip && !(await rateAllow(`group_create_ip:${ip}`, 10, 3600))) {
    sendJson(res, 429, { error: "Too many groups created from here. Try again later." });
    return;
  }

  if (!(await verifyPlanOwnership(input.planSlug, input.editKey))) {
    sendJson(res, 403, { error: "That plan slug and edit key don't match." });
    return;
  }

  let passphraseHash: string;
  try {
    passphraseHash = await bcrypt.hash(input.normalizedPassphrase, BCRYPT_COST);
  } catch {
    sendJson(res, 500, { error: "Could not secure the passphrase." });
    return;
  }

  const groupSlug = randomGroupSlug();
  const insert = await adminInsert("groups", {
    group_slug: groupSlug,
    name: input.name,
    start_date: input.startDate,
    end_date: input.endDate,
    passphrase_hash: passphraseHash,
  });
  if (!insert.ok) {
    sendJson(res, 502, { error: "Could not create the group." });
    return;
  }

  const feedToken = randomFeedToken();
  const joined = await adminRpc("join_group", {
    p_group_slug: groupSlug,
    p_plan_slug: input.planSlug,
    p_display_name: input.displayName,
    p_feed_token: feedToken,
  });
  if (!joined.ok) {
    // No cross-request transaction — undo the group so we don't leak an
    // empty, unreachable row.
    await adminDelete(`groups?group_slug=eq.${groupSlug}`).catch(() => undefined);
    sendJson(res, 502, { error: "Could not finish setting up the group." });
    return;
  }

  const row = Array.isArray(joined.data) ? (joined.data[0] as Record<string, unknown>) : null;
  const color = row && typeof row.color === "string" ? row.color : null;
  const joinOrder = row && typeof row.join_order === "number" ? row.join_order : 0;

  setGroupCookie(res, makeGroupToken(groupSlug, secret), DEFAULT_TTL_SECONDS);
  sendJson(res, 200, { groupSlug, feedToken, color, joinOrder });
}
