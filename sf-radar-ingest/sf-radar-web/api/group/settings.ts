import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { validateSettings } from "../_lib/groupCore.js";
import {
  GROUP_COOKIE,
  clientIp,
  readCookie,
  readJsonBody,
  rejectWrongMethod,
  sendJson,
} from "../_lib/groupHttp.js";
import { verifyGroupToken } from "../_lib/groupToken.js";
import { adminConfigured, adminSelect, adminUpdate, rateAllow } from "../_lib/supabaseAdmin.js";

/**
 * POST /api/group/settings — change the group name and/or its passphrase
 * after creation.
 *
 * Body: { name?, currentPassphrase?, newPassphrase? } (at least one of name /
 * newPassphrase). The group is taken from the session COOKIE, never the body.
 *
 * Membership is symmetric (no owner role, per HANDOFF): holding a valid
 * passphrase-gate cookie for this group is the authorisation bar. Changing
 * the passphrase additionally requires the current one — bcrypt-compared
 * here — so a left-open session can't silently rotate it. Attempts are
 * rate-limited per group slug and per IP, before the bcrypt work.
 *
 * A passphrase change does NOT invalidate anyone's session cookie (those are
 * signed {groupSlug, exp}, unrelated to the hash) — only new joiners need the
 * new value. The bcrypt cost of 10 matches groups.passphrase_hash's format
 * comment and what create.ts / login.ts use.
 */

const BCRYPT_COST = 10;
// Same fixed dummy hash login.ts uses — compared against when the group row
// is somehow missing, so a change attempt can't be used to probe existence.
const DUMMY_HASH = "$2b$10$Ep4kUvCqB4d4Ymu.uAc4PuD9SuT22ZYH0NNIPVG0MG9jfE0ID24j.";

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

  const parsed = validateSettings(readJsonBody(req));
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error });
    return;
  }
  const input = parsed.value;

  const ip = clientIp(req);
  const ipOk = ip ? await rateAllow(`grp_settings_ip:${ip}`, 40, 900) : true;
  const slugOk = await rateAllow(`grp_settings_slug:${session.g}`, 15, 900);
  if (!ipOk || !slugOk) {
    sendJson(res, 429, { error: "Too many changes. Try again in a few minutes." });
    return;
  }

  const patch: Record<string, unknown> = {};

  if (input.changePassphrase) {
    const lookup = await adminSelect(
      `groups?group_slug=eq.${session.g}&select=passphrase_hash&limit=1`,
    );
    const row =
      lookup.ok && Array.isArray(lookup.data) && lookup.data.length === 1
        ? (lookup.data[0] as Record<string, unknown>)
        : null;
    const hash = row && typeof row.passphrase_hash === "string" ? row.passphrase_hash : DUMMY_HASH;

    let match = false;
    try {
      match = await bcrypt.compare(input.currentPassphrase, hash);
    } catch {
      match = false;
    }
    if (!row || !match) {
      sendJson(res, 403, { error: "Current passphrase is incorrect." });
      return;
    }

    try {
      patch.passphrase_hash = await bcrypt.hash(input.newPassphrase, BCRYPT_COST);
    } catch {
      sendJson(res, 500, { error: "Could not secure the new passphrase." });
      return;
    }
  }

  if (input.name !== null) {
    patch.name = input.name;
  }

  const updated = await adminUpdate(`groups?group_slug=eq.${session.g}`, patch);
  if (!updated.ok || !Array.isArray(updated.data) || updated.data.length !== 1) {
    sendJson(res, 502, { error: "Could not save the changes." });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    name: input.name ?? undefined,
    passphraseChanged: input.changePassphrase,
  });
}
