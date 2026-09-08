import { buildGroupFeedIcs, type GroupFeedItem } from "./ics.js";

/**
 * Pure core of GET /api/group/feed/<token>.ics: turn the rows
 * group_feed_by_token() returned into an HTTP response shape. No fetch, no
 * req/res — unit-tested against the real RPC row shape, and can't throw into
 * the runtime.
 *
 * The endpoint decides token validity (a separate lookup) BEFORE calling
 * this, because a valid token for a group where every plan is currently
 * empty also yields zero feed rows — that must serve a valid empty
 * VCALENDAR (200), not a 404. So this function always builds a 200 unless
 * the ICS writer itself throws.
 */

export interface GroupFeedResult {
  status: 200 | 500;
  body: string;
  filename: string;
}

function isRow(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Content-Disposition filename: letters/digits/hyphen only, no header break. */
export function groupFeedFilename(groupName: string): string {
  const base = groupName
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base ? `${base}-` : ""}sf-radar-group.ics`;
}

function toItem(row: Record<string, unknown>): GroupFeedItem | null {
  const starts_at = typeof row.starts_at === "string" ? row.starts_at : "";
  if (!starts_at) return null;
  return {
    member_name: typeof row.member_name === "string" ? row.member_name : "Member",
    join_order: typeof row.join_order === "number" ? row.join_order : 0,
    is_busy: row.is_busy === true,
    source: typeof row.source === "string" ? row.source : "custom",
    source_id: typeof row.source_id === "string" ? row.source_id : "",
    title: typeof row.title === "string" && row.title.length > 0 ? row.title : "Event",
    starts_at,
    ends_at: typeof row.ends_at === "string" ? row.ends_at : null,
    location: typeof row.location === "string" ? row.location : null,
    note: typeof row.note === "string" ? row.note : null,
    url_slug: typeof row.url_slug === "string" ? row.url_slug : null,
  };
}

/**
 * @param rpcData rows from group_feed_by_token (may be [])
 * @param groupNameFallback name to use when there are zero rows to read it from
 */
export function groupFeedIcs(rpcData: unknown, groupNameFallback: string): GroupFeedResult {
  const rows = Array.isArray(rpcData) ? rpcData.filter(isRow) : [];
  const groupName =
    typeof rows[0]?.group_name === "string" && (rows[0].group_name as string).length > 0
      ? (rows[0].group_name as string)
      : groupNameFallback || "SF Radar group";
  const filename = groupFeedFilename(groupName);

  try {
    const items = rows.map(toItem).filter((i): i is GroupFeedItem => i !== null);
    const { value } = buildGroupFeedIcs(items, { calName: `${groupName} (SF Radar group)` });
    return { status: 200, body: value ?? "", filename };
  } catch {
    return { status: 500, body: "Couldn't build the group calendar feed.", filename };
  }
}
