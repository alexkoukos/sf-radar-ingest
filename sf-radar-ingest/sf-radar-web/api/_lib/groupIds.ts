import { randomBytes } from "node:crypto";

/**
 * CSPRNG identifiers for the group feature. Every value here comes from
 * node:crypto.randomBytes (the platform CSPRNG) — never Math.random — and is
 * shaped to satisfy the CHECK constraints migration 003 put on the columns.
 */

/**
 * Group slug: 16 bytes / 128 bits, lowercase hex → 32 chars.
 * Matches `groups.group_slug` CHECK `^[a-f0-9]{32}$`. Unguessable; it is the
 * only thing in the /group/<slug> URL and grants nothing on its own (the
 * passphrase gate is separate and server-enforced).
 */
export function randomGroupSlug(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Feed token: 24 bytes / 192 bits, base64url (no padding) → exactly 32 chars.
 * Matches `group_members.feed_token` CHECK `^[A-Za-z0-9_-]{32}$`. Carried in
 * the calendar-feed URL path because calendar apps can't enter a passphrase;
 * revocable via `feed_revoked` + `rotate_feed_token`.
 */
export function randomFeedToken(): string {
  return randomBytes(24).toString("base64url");
}

export const GROUP_SLUG_RE = /^[a-f0-9]{32}$/;
export const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
/** Plan read slug — shared with the standalone-plan feature (see src/lib/plan.ts). */
export const PLAN_SLUG_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** Plan edit key — the write credential; hex, never in a URL. */
export const EDIT_KEY_RE = /^[a-f0-9]{32,64}$/;
