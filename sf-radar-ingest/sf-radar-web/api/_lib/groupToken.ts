import { createHmac, timingSafeEqual } from "node:crypto";
import { GROUP_SLUG_RE } from "./groupIds.js";

/**
 * The web-UI session token that proves "this browser entered the passphrase
 * for group <g>". Format:
 *
 *     base64url(JSON({ g, exp })) + "." + base64url(HMAC-SHA256(body, secret))
 *
 *   g   = group slug (32 hex)
 *   exp = expiry, unix seconds
 *
 * Signed with GROUP_TOKEN_SECRET (Vercel env var). It is only ever carried in
 * an `HttpOnly; Secure; SameSite=Lax` cookie — never readable by client JS,
 * never accepted from a request body. Single active group at a time
 * (see HANDOFF): a new login overwrites the cookie.
 *
 * This is a gate token, not an identity/auth token: it says a passphrase was
 * entered, nothing about *who*. Naming a member is a separate step.
 */

export const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface GroupTokenPayload {
  g: string;
  exp: number;
}

function encodePayload(payload: GroupTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function makeGroupToken(
  groupSlug: string,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const payload: GroupTokenPayload = {
    g: groupSlug,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = encodePayload(payload);
  return `${body}.${sign(body, secret)}`;
}

/**
 * Returns the payload iff the signature verifies (constant-time) AND the
 * token is unexpired AND the slug is well-formed. Any tampering, a wrong
 * secret, a malformed token, or expiry → null. Callers treat null as
 * "not unlocked" and respond with the same 401 they use for a missing cookie.
 */
export function verifyGroupToken(
  token: string | undefined | null,
  secret: string,
): GroupTokenPayload | null {
  if (!token || !secret) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const providedMac = Buffer.from(token.slice(dot + 1));
  const expectedMac = Buffer.from(sign(body, secret));
  if (providedMac.length !== expectedMac.length) return null;
  if (!timingSafeEqual(providedMac, expectedMac)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const { g, exp } = payload as Record<string, unknown>;
  if (typeof g !== "string" || !GROUP_SLUG_RE.test(g)) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp * 1000 <= Date.now()) return null;

  return { g, exp };
}
