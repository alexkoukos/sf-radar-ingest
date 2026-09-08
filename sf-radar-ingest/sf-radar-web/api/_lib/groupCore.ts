import { EDIT_KEY_RE, GROUP_SLUG_RE, PLAN_SLUG_RE } from "./groupIds.js";
import { cleanText } from "./groupText.js";
import { normalizePassphrase, passphraseLengthError } from "./passphrase.js";

/**
 * Pure request-shaping for the four group endpoints. No `fetch`, no req/res,
 * no crypto — so it is unit-tested directly against representative bodies
 * (see src/lib/groupCore.test.ts), mirroring the planFeed.ts pattern.
 *
 * Every validator returns a discriminated result; the handler turns a
 * `{ ok: false }` straight into a 400. Names are run through cleanText here
 * (the same transform the DB applies) so what the handler forwards to the DB
 * and echoes into JSON already has CR/LF and control chars removed.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_MAX = 80;
const DISPLAY_NAME_MAX = 40;

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A calendar date that actually exists (rejects 2026-02-30, month 13, ...). */
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export interface CreateInput {
  planSlug: string;
  editKey: string;
  name: string;
  startDate: string;
  endDate: string;
  /** Already trim/NFC/lowercased — ready to bcrypt.hash. */
  normalizedPassphrase: string;
  displayName: string;
}

export function validateCreate(body: unknown): Validated<CreateInput> {
  if (!isPlainRecord(body)) return { ok: false, error: "Expected a JSON object." };

  const planSlug = typeof body.planSlug === "string" ? body.planSlug : "";
  if (!PLAN_SLUG_RE.test(planSlug)) return { ok: false, error: "Invalid plan slug." };

  const editKey = typeof body.editKey === "string" ? body.editKey : "";
  if (!EDIT_KEY_RE.test(editKey)) return { ok: false, error: "Invalid edit key." };

  const name = cleanText(body.name);
  if (!name || name.length > NAME_MAX) {
    return { ok: false, error: `Group name must be 1-${NAME_MAX} characters.` };
  }

  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  if (!isRealDate(startDate) || !isRealDate(endDate)) {
    return { ok: false, error: "startDate and endDate must be real YYYY-MM-DD dates." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "endDate must not be before startDate." };
  }

  const normalizedPassphrase = normalizePassphrase(body.passphrase);
  const passErr = passphraseLengthError(normalizedPassphrase);
  if (passErr) return { ok: false, error: passErr };

  const displayName = cleanText(body.displayName);
  if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Your name must be 1-${DISPLAY_NAME_MAX} characters.` };
  }

  return {
    ok: true,
    value: { planSlug, editKey, name, startDate, endDate, normalizedPassphrase, displayName },
  };
}

export interface LoginInput {
  groupSlug: string;
  normalizedPassphrase: string;
}

export function validateLogin(body: unknown): Validated<LoginInput> {
  if (!isPlainRecord(body)) return { ok: false, error: "Expected a JSON object." };

  const groupSlug = typeof body.groupSlug === "string" ? body.groupSlug : "";
  if (!GROUP_SLUG_RE.test(groupSlug)) return { ok: false, error: "Invalid group link." };

  // Length is NOT enforced on login — a wrong length is just a wrong
  // passphrase, and enforcing it here would make the error path diverge from
  // the "no such group" path. Only an outright missing value is rejected.
  const normalizedPassphrase = normalizePassphrase(body.passphrase);
  if (normalizedPassphrase.length === 0) {
    return { ok: false, error: "Passphrase is required." };
  }

  return { ok: true, value: { groupSlug, normalizedPassphrase } };
}

export interface JoinInput {
  planSlug: string;
  editKey: string;
  displayName: string;
}

export function validateJoin(body: unknown): Validated<JoinInput> {
  if (!isPlainRecord(body)) return { ok: false, error: "Expected a JSON object." };

  const planSlug = typeof body.planSlug === "string" ? body.planSlug : "";
  if (!PLAN_SLUG_RE.test(planSlug)) return { ok: false, error: "Invalid plan slug." };

  const editKey = typeof body.editKey === "string" ? body.editKey : "";
  if (!EDIT_KEY_RE.test(editKey)) return { ok: false, error: "Invalid edit key." };

  const displayName = cleanText(body.displayName);
  if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Your name must be 1-${DISPLAY_NAME_MAX} characters.` };
  }

  return { ok: true, value: { planSlug, editKey, displayName } };
}

/**
 * Map a Postgres error message raised by join_group into an HTTP status +
 * client-safe message. Anything unrecognised is a 502 (our problem, not the
 * caller's).
 */
export function joinErrorToHttp(pgMessage: string | undefined): { status: number; error: string } {
  const m = (pgMessage ?? "").toLowerCase();
  if (m.includes("already a member")) {
    return { status: 409, error: "That plan is already in this group." };
  }
  if (m.includes("group is full")) {
    return { status: 409, error: "This group is full (16 members max)." };
  }
  if (m.includes("rate limit")) {
    return { status: 429, error: "Too many join attempts. Try again later." };
  }
  if (m.includes("no such group")) {
    return { status: 404, error: "Group not found." };
  }
  if (m.includes("plan does not exist")) {
    return { status: 400, error: "Publish your plan before joining a group." };
  }
  if (m.includes("bad feed token")) {
    return { status: 500, error: "Could not create your calendar token." };
  }
  return { status: 502, error: "Could not join the group." };
}
