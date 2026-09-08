import { describe, expect, it } from "vitest";
import type { GroupMember } from "./groupView";
import {
  buildGroupNights,
  mergeAttendance,
  ownedCustomEvents,
} from "./groupMerge";

function ev(api_id: string, starts_at: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    api_id,
    name: `Event ${api_id}`,
    url_slug: api_id,
    starts_at,
    ends_at: null,
    is_online: false,
    host_name: "Host",
    city: "San Francisco",
    region: "CA",
    sublocality: "SoMa",
    is_free: true,
    price_cents: null,
    rsvp_type: "OPEN",
    category: "OTHER",
    score: 0.5,
    ...over,
  } as unknown as GroupMember["attending"][number];
}

function member(over: Partial<GroupMember>): GroupMember {
  return {
    display_name: "X",
    color: "#E69F00",
    join_order: 0,
    read_slug: "slug",
    tz_mode: "tzid",
    attending: [],
    custom_events: [],
    ...over,
  };
}

const SHARED = "evt-shared-AAA";

describe("mergeAttendance - the shared-event collapse", () => {
  it("renders a shared event ONCE with every attendee stacked, in join order", () => {
    const members = [
      member({ display_name: "Alekos", join_order: 0, color: "#E69F00", attending: [ev(SHARED, "2026-09-16T23:00:00+00:00"), ev("evt-solo-1", "2026-09-17T01:00:00+00:00")] }),
      member({ display_name: "Mara", join_order: 1, color: "#56B4E9", attending: [ev(SHARED, "2026-09-16T23:00:00+00:00")] }),
      member({ display_name: "Dev", join_order: 2, color: "#009E73", attending: [ev(SHARED, "2026-09-16T23:00:00+00:00")] }),
    ];

    const merged = mergeAttendance(members, 1);
    const shared = merged.filter((m) => m.api_id === SHARED);

    expect(shared).toHaveLength(1);
    expect(shared[0].attendees.map((a) => a.display_name)).toEqual(["Alekos", "Mara", "Dev"]);
    expect(shared[0].attendees.map((a) => a.join_order)).toEqual([0, 1, 2]);
    expect(shared[0].attendees.find((a) => a.display_name === "Mara")?.is_me).toBe(true);
    expect(shared[0].attendees.find((a) => a.display_name === "Alekos")?.is_me).toBe(false);

    // total merged rows: 1 shared + 1 solo = 2, not 3+1
    expect(merged).toHaveLength(2);
  });

  it("does not double-count a member who somehow lists the same event twice", () => {
    const members = [
      member({ join_order: 0, attending: [ev(SHARED, "2026-09-16T23:00:00+00:00"), ev(SHARED, "2026-09-16T23:00:00+00:00")] }),
    ];
    expect(mergeAttendance(members, null)[0].attendees).toHaveLength(1);
  });

  it("skips entries with no api_id or no start time", () => {
    const members = [
      member({ join_order: 0, attending: [ev("", "2026-09-16T23:00:00+00:00"), ev("evt-x", "")] }),
    ];
    expect(mergeAttendance(members, null)).toHaveLength(0);
  });

  it("a single-attendee event is still returned (length-1 attendees)", () => {
    const members = [member({ join_order: 0, attending: [ev("evt-solo", "2026-09-16T23:00:00+00:00")] })];
    const merged = mergeAttendance(members, null);
    expect(merged).toHaveLength(1);
    expect(merged[0].attendees).toHaveLength(1);
  });
});

describe("ownedCustomEvents - never merged, keep their owner", () => {
  it("attaches each custom event to exactly its owning member", () => {
    const members = [
      member({ display_name: "Mara", join_order: 1, color: "#56B4E9", custom_events: [
        { event_id: "ce1", kind: "busy", visibility: "busy", starts_at: "2026-09-16T17:00:00+00:00", ends_at: null },
      ] }),
      member({ display_name: "Alekos", join_order: 0, color: "#E69F00", custom_events: [
        { event_id: "ce2", kind: "generic", visibility: "shared", title: "Group dinner", starts_at: "2026-09-18T01:00:00+00:00" },
      ] }),
    ];
    const owned = ownedCustomEvents(members, 1);
    expect(owned).toHaveLength(2);
    const busy = owned.find((o) => o.custom.event_id === "ce1")!;
    expect(busy.owner.display_name).toBe("Mara");
    expect(busy.owner.is_me).toBe(true);
    expect(busy.custom.kind).toBe("busy");
  });
});

describe("buildGroupNights", () => {
  const members = [
    member({ display_name: "Alekos", join_order: 0, attending: [ev(SHARED, "2026-09-16T23:00:00+00:00")] }),
    member({ display_name: "Mara", join_order: 1, attending: [ev(SHARED, "2026-09-16T23:00:00+00:00")] }),
  ];

  it("keeps every night in the window, even empty ones, in date order", () => {
    const nights = buildGroupNights("2026-09-14", "2026-09-27", mergeAttendance(members, null), []);
    expect(nights).toHaveLength(14);
    expect(nights[0].date).toBe("2026-09-14");
    expect(nights[13].date).toBe("2026-09-27");
    expect(nights.every((n) => n.inWindow)).toBe(true);
  });

  it("buckets the shared event on its LA calendar night (23:00Z on the 16th = 4pm PDT, still the 16th)", () => {
    const nights = buildGroupNights("2026-09-14", "2026-09-27", mergeAttendance(members, null), []);
    const n16 = nights.find((n) => n.date === "2026-09-16")!;
    expect(n16.items).toHaveLength(1);
    expect(n16.items[0].kind).toBe("luma");
  });

  it("adds an out-of-window night for an event outside the trip, flagged inWindow:false", () => {
    const late = [member({ join_order: 0, attending: [ev("evt-late", "2026-10-02T20:00:00+00:00")] })];
    const nights = buildGroupNights("2026-09-14", "2026-09-27", mergeAttendance(late, null), []);
    const extra = nights.find((n) => n.date === "2026-10-02")!;
    expect(extra).toBeTruthy();
    expect(extra.inWindow).toBe(false);
    expect(nights[nights.length - 1].date).toBe("2026-10-02");
  });
});
