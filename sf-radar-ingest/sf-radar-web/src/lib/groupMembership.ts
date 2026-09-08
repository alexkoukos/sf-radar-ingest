/**
 * The one thing the main app remembers about a trip group: its slug, its
 * name, and this member's colour + join order. Persisted to localStorage so
 * the GROUP section and the header indicator survive a reload.
 *
 * NOT stored, ever: the passphrase (hard rule — shown once at creation, then
 * it's on the user to have copied it) or the plan edit key (that has its own
 * key, sfradar:v1:planEditKey). The HttpOnly session cookie is what actually
 * authorises group reads; this is just a local breadcrumb.
 */

const GROUP_KEY = "sfradar:v1:group";
export const GROUP_SLUG_RE = /^[a-f0-9]{32}$/;
const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export interface GroupMembership {
  slug: string;
  name: string;
  color: string;
  joinOrder: number;
  /** This member's revocable calendar-feed token. "" for breadcrumbs written
   *  before the feed shipped — the feed block just hides until they re-join. */
  feedToken: string;
}

export function loadGroupMembership(): GroupMembership | null {
  try {
    const raw = localStorage.getItem(GROUP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<GroupMembership>;
    if (typeof p.slug !== "string" || !GROUP_SLUG_RE.test(p.slug)) return null;
    return {
      slug: p.slug,
      name: typeof p.name === "string" ? p.name : "your group",
      color: typeof p.color === "string" && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#4D4D4D",
      joinOrder: typeof p.joinOrder === "number" ? p.joinOrder : 0,
      feedToken:
        typeof p.feedToken === "string" && FEED_TOKEN_RE.test(p.feedToken) ? p.feedToken : "",
    };
  } catch {
    return null;
  }
}

export interface GroupFeedUrls {
  https: string;
  webcal: string;
  google: string;
}

/** The three subscribe forms for the combined group feed. */
export function groupFeedUrls(feedToken: string, origin?: string): GroupFeedUrls {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const https = `${base}/group/feed/${feedToken}.ics`;
  const webcal = https.replace(/^https?:/i, "webcal:");
  const google = `https://calendar.google.com/calendar/render?cid=${webcal}`;
  return { https, webcal, google };
}

/** Fires after a same-tab save/clear so the nav indicator can re-read without a reload. */
export const GROUP_CHANGED_EVENT = "sfradar:group-changed";
function notifyGroupChange(): void {
  try {
    window.dispatchEvent(new Event(GROUP_CHANGED_EVENT));
  } catch {
    /* non-DOM context */
  }
}

export function saveGroupMembership(m: GroupMembership): void {
  try {
    localStorage.setItem(GROUP_KEY, JSON.stringify(m));
  } catch {
    /* private browsing — the value still works for this session's state */
  }
  notifyGroupChange();
}

export function clearGroupMembership(): void {
  try {
    localStorage.removeItem(GROUP_KEY);
  } catch {
    /* non-fatal */
  }
  notifyGroupChange();
}

/** A 32-hex group slug out of a pasted /group/<slug> URL, or a bare slug. */
export function parseGroupSlug(input: string): string | null {
  const m = /([a-f0-9]{32})/i.exec(input.trim());
  return m ? m[1].toLowerCase() : null;
}

export interface CreateGroupResponse {
  groupSlug: string;
  color: string;
  joinOrder: number;
  feedToken: string;
}

export interface CreateGroupInput {
  planSlug: string;
  editKey: string;
  name: string;
  startDate: string;
  endDate: string;
  passphrase: string;
  displayName: string;
}

export async function createGroup(input: CreateGroupInput): Promise<CreateGroupResponse> {
  const res = await fetch("/api/group/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : `Couldn't create the group (${res.status}).`,
    );
  }
  return body as unknown as CreateGroupResponse;
}

export interface JoinGroupInput {
  groupSlug: string;
  passphrase: string;
  planSlug: string;
  editKey: string;
  displayName: string;
}

export interface JoinGroupResponse {
  color: string;
  joinOrder: number;
  feedToken: string;
}

export interface UpdateGroupSettingsInput {
  /** New group name, or undefined to leave it unchanged. */
  name?: string;
  /** Both required together to rotate the passphrase. */
  currentPassphrase?: string;
  newPassphrase?: string;
}

/**
 * POST /api/group/settings — rename the group and/or change its passphrase.
 * Authorised by the HttpOnly group-session cookie; changing the passphrase
 * also needs the current one. No migration — `groups.name` /
 * `passphrase_hash` are updated in place by the service-role endpoint.
 */
export async function updateGroupSettings(input: UpdateGroupSettingsInput): Promise<void> {
  const res = await fetch("/api/group/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(
      res.status === 429
        ? "Too many changes. Wait a few minutes and try again."
        : (body.error ?? `Couldn't save the changes (${res.status}).`),
    );
  }
}

export async function joinGroup(input: JoinGroupInput): Promise<JoinGroupResponse> {
  const login = await fetch("/api/group/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ groupSlug: input.groupSlug, passphrase: input.passphrase }),
  });
  if (!login.ok) {
    const b = (await login.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      login.status === 429
        ? "Too many attempts. Wait a few minutes and try again."
        : (b.error ?? "Wrong passphrase, or no group with that link."),
    );
  }

  const join = await fetch("/api/group/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      planSlug: input.planSlug,
      editKey: input.editKey,
      displayName: input.displayName,
    }),
  });
  const jb = (await join.json().catch(() => ({}))) as Record<string, unknown>;
  if (!join.ok) {
    throw new Error(
      typeof jb.error === "string" ? jb.error : `Couldn't join the group (${join.status}).`,
    );
  }
  return jb as unknown as JoinGroupResponse;
}
