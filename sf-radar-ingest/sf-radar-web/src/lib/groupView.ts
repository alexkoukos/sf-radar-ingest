import type { EventLike } from "../types";
import { peekSlug } from "./plan";

/**
 * Client access to the gated group endpoints (Part 1). The group's data is
 * never reachable with the anon key — every read goes through
 * /api/group/view, which checks the signed HttpOnly session cookie set by
 * /api/group/login. This module only does the two fetches and normalizes
 * their outcomes; the merge/bucket logic is in groupMerge.ts (pure).
 */

export interface GroupInfo {
  name: string;
  start_date: string;
  end_date: string;
}

export interface GroupCustomEvent {
  event_id: string;
  /** 'busy' here is the server's redacted form (kind collapsed), not a real column value. */
  kind: "generic" | "meeting" | "busy";
  visibility: "shared" | "busy";
  title?: string | null;
  starts_at: string;
  ends_at?: string | null;
  location?: string | null;
  note?: string | null;
  /** Present only on 'shared' entries — redacted out of 'busy' by group_view. */
  url?: string | null;
  with_name?: string | null;
  with_company?: string | null;
  meeting_type?: string | null;
}

export interface GroupMember {
  display_name: string;
  color: string;
  join_order: number;
  read_slug: string;
  tz_mode: "tzid" | "floating";
  attending: EventLike[];
  custom_events: GroupCustomEvent[];
}

export interface GroupView {
  group: GroupInfo;
  members: GroupMember[];
}

export type GroupViewResult =
  | { status: "ok"; view: GroupView; meMember: GroupMember | null }
  | { status: "gate" }
  | { status: "notfound" }
  | { status: "error"; message: string };

export async function fetchGroupView(slug: string): Promise<GroupViewResult> {
  let res: Response;
  try {
    res = await fetch(`/api/group/view?slug=${encodeURIComponent(slug)}`, {
      headers: { accept: "application/json" },
    });
  } catch {
    return { status: "error", message: "Couldn't reach the group service." };
  }

  if (res.status === 401) return { status: "gate" };
  if (res.status === 404) return { status: "notfound" };
  if (!res.ok) return { status: "error", message: `Group service error (${res.status}).` };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: "error", message: "Unreadable response from the group service." };
  }

  const view = body as GroupView;
  if (!view || typeof view !== "object" || !view.group || !Array.isArray(view.members)) {
    return { status: "notfound" };
  }

  const mySlug = peekSlug();
  const meMember = mySlug ? (view.members.find((m) => m.read_slug === mySlug) ?? null) : null;
  return { status: "ok", view, meMember };
}

export interface GroupLoginResult {
  ok: boolean;
  status: number;
  message?: string;
}

export async function groupLogin(slug: string, passphrase: string): Promise<GroupLoginResult> {
  let res: Response;
  try {
    res = await fetch("/api/group/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupSlug: slug, passphrase }),
    });
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach the group service." };
  }

  if (res.ok) return { ok: true, status: res.status };

  let message = "That didn't work.";
  try {
    const b = (await res.json()) as { error?: string };
    if (b?.error) message = b.error;
  } catch {
    /* keep default */
  }
  return { ok: false, status: res.status, message };
}
