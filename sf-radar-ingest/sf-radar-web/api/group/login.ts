import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { validateLogin } from "../_lib/groupCore.js";
import { clientIp, readJsonBody, rejectWrongMethod, sendJson, setGroupCookie } from "../_lib/groupHttp.js";
import { DEFAULT_TTL_SECONDS, makeGroupToken } from "../_lib/groupToken.js";
import { adminConfigured, adminSelect, rateAllow } from "../_lib/supabaseAdmin.js";

/**
 * POST /api/group/login — the passphrase gate. The group link alone is not
 * enough to view or join; this exchanges { groupSlug, passphrase } for the
 * signed HttpOnly session cookie.
 *
 * Enforcement is entirely server-side. Group data is never sent here and is
 * unreachable with the anon key.
 *
 * "No such group" and "wrong passphrase" return the *same* 401 body, and take
 * comparable time: when the group is missing we still run one bcrypt.compare
 * against a fixed dummy hash, so the response timing does not reveal whether
 * a slug exists. Attempts are rate-limited per IP and per group slug.
 */

// bcrypt hash of a random string at cost 10. Compared against when the group
// slug is unknown, purely to equalise timing with the real path. Not a secret.
const DUMMY_HASH = "$2b$10$Ep4kUvCqB4d4Ymu.uAc4PuD9SuT22ZYH0NNIPVG0MG9jfE0ID24j.";
const GENERIC_401 = { error: "Wrong passphrase, or no group with that link." };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (rejectWrongMethod(req, res, "POST")) return;

  const secret = process.env.GROUP_TOKEN_SECRET ?? "";
  if (!adminConfigured() || !secret) {
    sendJson(res, 500, { error: "Group feature is not configured." });
    return;
  }

  const parsed = validateLogin(readJsonBody(req));
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  const { groupSlug, normalizedPassphrase } = parsed.value;

  // Rate-limit BEFORE the bcrypt work, on both axes (per spec ~10 / 15 min
  // per group; a looser per-IP cap catches slug-spraying).
  const ip = clientIp(req);
  const ipOk = ip ? await rateAllow(`grp_login_ip:${ip}`, 40, 900) : true;
  const slugOk = await rateAllow(`grp_login_slug:${groupSlug}`, 10, 900);
  if (!ipOk || !slugOk) {
    sendJson(res, 429, { error: "Too many attempts. Try again in a few minutes." });
    return;
  }

  const lookup = await adminSelect(
    `groups?group_slug=eq.${groupSlug}&select=passphrase_hash&limit=1`,
  );
  const row =
    lookup.ok && Array.isArray(lookup.data) && lookup.data.length === 1
      ? (lookup.data[0] as Record<string, unknown>)
      : null;
  const hash = row && typeof row.passphrase_hash === "string" ? row.passphrase_hash : DUMMY_HASH;

  let match = false;
  try {
    match = await bcrypt.compare(normalizedPassphrase, hash);
  } catch {
    match = false;
  }

  if (!row || !match) {
    sendJson(res, 401, GENERIC_401);
    return;
  }

  setGroupCookie(res, makeGroupToken(groupSlug, secret), DEFAULT_TTL_SECONDS);
  sendJson(res, 200, { ok: true });
}
