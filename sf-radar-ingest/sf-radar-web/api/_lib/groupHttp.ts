import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Thin HTTP helpers shared by the four group endpoints (create / login /
 * join / view). Routing and I/O only — all validation lives in groupCore,
 * all crypto in groupToken / groupIds, all DB access in supabaseAdmin.
 */

export const GROUP_COOKIE = "sfr_grp";

/** Read one cookie by name from the request. */
export function readCookie(req: VercelRequest, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Set (or refresh) the signed group-session cookie. HttpOnly + Secure + Lax. */
export function setGroupCookie(res: VercelResponse, value: string, maxAgeSeconds: number): void {
  res.setHeader(
    "Set-Cookie",
    `${GROUP_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.floor(
      maxAgeSeconds,
    )}; HttpOnly; Secure; SameSite=Lax`,
  );
}

/** First hop of X-Forwarded-For — the real client, for per-IP rate-limit buckets. */
export function clientIp(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? (xff[0] ?? "") : (xff ?? "");
  return raw.split(",")[0]!.trim();
}

/** Parse a JSON request body, tolerating @vercel/node's pre-parsed object. */
export function readJsonBody(req: VercelRequest): Record<string, unknown> {
  const body: unknown = req.body;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  if (typeof body === "string" && body.length > 0) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through */
    }
  }
  return {};
}

/** JSON response with the always-on group headers (never index a group route). */
export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.send(JSON.stringify(body));
}

/** 405 with an Allow header when the method is wrong. Returns true if it handled. */
export function rejectWrongMethod(
  req: VercelRequest,
  res: VercelResponse,
  allowed: string,
): boolean {
  if (req.method === allowed) return false;
  res.setHeader("Allow", allowed);
  sendJson(res, 405, { error: "Method not allowed." });
  return true;
}
