/**
 * Service-role Supabase access for the group endpoints.
 *
 * The group tables (groups / group_members / custom_events / rate_limits)
 * have RLS ENABLEd with ZERO policies, so the anon key cannot touch them at
 * all. Reads/writes go through this module, which authenticates as
 * `service_role` (BYPASSRLS) after the endpoint has validated the passphrase
 * cookie. `SUPABASE_SERVICE_ROLE_KEY` is server-only — never Vite-prefixed,
 * never imported from src/, never sent to the client.
 *
 * Only the SECURITY DEFINER functions and the `groups` row insert are used;
 * this is not a general query layer.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function adminConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

export interface AdminResult {
  ok: boolean;
  status: number;
  data: unknown;
  /** Postgres error message when ok === false and the body carried one. */
  error?: string;
}

function baseHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function parse(res: Response): Promise<AdminResult> {
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  const result: AdminResult = { ok: res.ok, status: res.status, data };
  if (!res.ok && data && typeof data === "object" && "message" in data) {
    result.error = String((data as { message: unknown }).message);
  }
  return result;
}

/** Call a Postgres function via PostgREST RPC as service role. */
export async function adminRpc(fn: string, args: Record<string, unknown>): Promise<AdminResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify(args),
  });
  return parse(res);
}

/** GET `/rest/v1/<pathAndQuery>` as service role (bypasses RLS). */
export async function adminSelect(pathAndQuery: string): Promise<AdminResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: "GET",
    headers: baseHeaders(),
  });
  return parse(res);
}

/** INSERT one row, returning the representation. */
export async function adminInsert(
  table: string,
  row: Record<string, unknown>,
): Promise<AdminResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...baseHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return parse(res);
}

/** PATCH `/rest/v1/<pathAndQuery>` — partial update of matched rows as service role. */
export async function adminUpdate(
  pathAndQuery: string,
  patch: Record<string, unknown>,
): Promise<AdminResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: "PATCH",
    headers: { ...baseHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return parse(res);
}

/** DELETE `/rest/v1/<pathAndQuery>` — used only for compensating cleanup. */
export async function adminDelete(pathAndQuery: string): Promise<AdminResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method: "DELETE",
    headers: baseHeaders(),
  });
  return parse(res);
}

/**
 * True iff a `plans` row exists with this exact slug + edit key. The group
 * endpoints call this before adopting a plan into a group (create) or adding
 * it as a member (join): join_group / the groups insert never check the write
 * credential themselves, so without this anyone could pull a stranger's
 * public read slug into a group. Returns false on any RPC error (fail
 * closed).
 */
export async function verifyPlanOwnership(planSlug: string, editKey: string): Promise<boolean> {
  const params = new URLSearchParams({
    slug: `eq.${planSlug}`,
    edit_key: `eq.${editKey}`,
    select: "slug",
    limit: "1",
  });
  const r = await adminSelect(`plans?${params.toString()}`);
  return r.ok && Array.isArray(r.data) && r.data.length === 1;
}

/**
 * Atomic fixed-window rate-limit hit. Returns true when the caller is still
 * UNDER the limit for this bucket, false when it has been exceeded. A failed
 * RPC is treated as "allow" so a transient DB blip never hard-locks a real
 * user out of creating or joining.
 */
export async function rateAllow(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const r = await adminRpc("rl_hit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (!r.ok) return true;
  return r.data !== false;
}
