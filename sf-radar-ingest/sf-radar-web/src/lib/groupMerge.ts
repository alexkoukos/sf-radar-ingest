import type { EventLike } from "../types";
import type { GroupCustomEvent, GroupMember } from "./groupView";

// Local, dependency-free copy of timeBoundaries.laDateString: the "YYYY-MM-DD"
// LA calendar date of an absolute instant. Kept here (rather than imported)
// so this pure module doesn't transitively pull in the Supabase client.
const laDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function laDateString(date: Date): string {
  return laDateFormatter.format(date);
}

/**
 * Pure shaping of a group_view payload into what the calendar renders.
 *
 * The load-bearing piece is mergeAttendance(): the same Luma event attended
 * by N members collapses to ONE MergedLumaEvent carrying an ordered list of
 * attendee refs — never N near-duplicate rows. This is the whole reason the
 * group feature exists, so it is unit-tested directly (groupMerge.test.ts).
 *
 * Custom events are owned by exactly one member and are never merged; they
 * stay attached to their owner (and their colour).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MemberRef {
  join_order: number;
  display_name: string;
  color: string;
  is_me: boolean;
}

export interface MergedLumaEvent {
  kind: "luma";
  api_id: string;
  /** Representative snapshot — the first attendee's copy. Attendees' snapshots
   *  differ only by score/rsvp drift; title/time are the event's own. */
  event: EventLike;
  /** Distinct attendees, ascending by join_order. length >= 1. */
  attendees: MemberRef[];
}

export interface OwnedCustomEvent {
  kind: "custom";
  owner: MemberRef;
  custom: GroupCustomEvent;
}

export type GroupItem = MergedLumaEvent | OwnedCustomEvent;

function memberRef(m: GroupMember, meJoinOrder: number | null): MemberRef {
  return {
    join_order: m.join_order,
    display_name: m.display_name,
    color: m.color,
    is_me: meJoinOrder !== null && m.join_order === meJoinOrder,
  };
}

/** api_id -> one merged event with every attending member stacked on it. */
export function mergeAttendance(
  members: GroupMember[],
  meJoinOrder: number | null,
): MergedLumaEvent[] {
  const byId = new Map<string, MergedLumaEvent>();

  for (const m of members) {
    const ref = memberRef(m, meJoinOrder);
    for (const ev of m.attending ?? []) {
      if (!ev || typeof ev.api_id !== "string" || !ev.api_id || !ev.starts_at) continue;
      let merged = byId.get(ev.api_id);
      if (!merged) {
        merged = { kind: "luma", api_id: ev.api_id, event: ev, attendees: [] };
        byId.set(ev.api_id, merged);
      }
      if (!merged.attendees.some((a) => a.join_order === ref.join_order)) {
        merged.attendees.push(ref);
      }
    }
  }

  for (const merged of byId.values()) {
    merged.attendees.sort((a, b) => a.join_order - b.join_order);
  }
  return [...byId.values()];
}

export function ownedCustomEvents(
  members: GroupMember[],
  meJoinOrder: number | null,
): OwnedCustomEvent[] {
  const out: OwnedCustomEvent[] = [];
  for (const m of members) {
    const owner = memberRef(m, meJoinOrder);
    for (const ce of m.custom_events ?? []) {
      if (!ce || !ce.starts_at) continue;
      out.push({ kind: "custom", owner, custom: ce });
    }
  }
  return out;
}

export function itemStart(item: GroupItem): string {
  return item.kind === "luma" ? (item.event.starts_at ?? "") : item.custom.starts_at;
}

export interface GroupNight {
  /** LA calendar date, "YYYY-MM-DD". */
  date: string;
  /** Whether this date is inside the group's declared trip window. */
  inWindow: boolean;
  /** Items on this night, ascending by start instant. */
  items: GroupItem[];
}

/** Walk startDate..endDate inclusive as LA calendar dates (UTC-midnight
 *  arithmetic — exact day math, DST-agnostic since it never reads local time). */
function windowDateList(startDate: string, endDate: string): string[] {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const end = Date.UTC(ey, em - 1, ed);
  const dates: string[] = [];
  for (let cur = Date.UTC(sy, sm - 1, sd); cur <= end; cur += DAY_MS) {
    const d = new Date(cur);
    dates.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate(),
      ).padStart(2, "0")}`,
    );
  }
  return dates;
}

/**
 * Night-by-night buckets covering the whole trip window (empty nights kept),
 * plus any extra nights that events fall on outside the window, all sorted.
 * An event's night is its start instant's LA calendar date.
 */
export function buildGroupNights(
  startDate: string,
  endDate: string,
  merged: MergedLumaEvent[],
  custom: OwnedCustomEvent[],
): GroupNight[] {
  const windowDates = windowDateList(startDate, endDate);
  const windowSet = new Set(windowDates);

  const buckets = new Map<string, GroupItem[]>();
  const add = (item: GroupItem) => {
    const key = laDateString(new Date(itemStart(item)));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  };
  merged.forEach(add);
  custom.forEach(add);

  const allDates = [...new Set<string>([...windowDates, ...buckets.keys()])].sort();
  return allDates.map((date) => ({
    date,
    inWindow: windowSet.has(date),
    items: (buckets.get(date) ?? []).sort((a, b) => itemStart(a).localeCompare(itemStart(b))),
  }));
}

/** Meeting title fallback: server sends null title for an unnamed meeting. */
export function meetingTitle(ce: GroupCustomEvent): string {
  if (ce.title) return ce.title;
  if (ce.kind === "meeting") {
    return ce.with_name ? `Meeting with ${ce.with_name}` : "Meeting";
  }
  return "Custom event";
}
