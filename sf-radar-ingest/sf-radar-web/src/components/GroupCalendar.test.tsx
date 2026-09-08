import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GroupView } from "../lib/groupView";
import GroupCalendar from "./GroupCalendar";

/**
 * Renders the real GroupCalendar tree (initial state = "Everyone") against a
 * representative group_view payload and asserts the load-bearing behaviour:
 * a Luma event two members are both on appears exactly ONCE, with both
 * members represented, not as two rows.
 *
 * renderToStaticMarkup gives the first paint — enough to prove the merge,
 * with no jsdom/RTL dependency.
 */

const SHARED_TITLE = "AI Biotech Block Party";
const SOLO_TITLE = "Founder Peer Group Meetup";

const VIEW: GroupView = {
  group: { name: "Sept SF crew", start_date: "2026-09-14", end_date: "2026-09-27" },
  members: [
    {
      display_name: "Alekos",
      color: "#E69F00",
      join_order: 0,
      read_slug: "aaaaaaaaaaaaaaaaaaaaaaaa",
      tz_mode: "tzid",
      attending: [
        {
          api_id: "evt-SHARED", name: SHARED_TITLE, url_slug: "block-party",
          starts_at: "2026-09-16T23:30:00+00:00", ends_at: "2026-09-17T02:00:00+00:00",
          is_online: false, host_name: "Some Host", city: "San Francisco", region: "CA",
          sublocality: "SoMa", is_free: true, price_cents: null, rsvp_type: "OPEN",
          category: "OTHER", score: 0.8,
        },
        {
          api_id: "evt-SOLO", name: SOLO_TITLE, url_slug: "peer-group",
          starts_at: "2026-09-17T00:00:00+00:00", ends_at: null, is_online: false,
          host_name: "9Zero", city: "San Francisco", region: "CA", sublocality: "FiDi",
          is_free: true, price_cents: null, rsvp_type: "APPLICATION", category: "FOUNDER_SOCIAL",
          score: 0.7,
        },
      ],
      custom_events: [
        {
          event_id: "ce-dinner", kind: "generic", visibility: "shared",
          title: "Group dinner — Nopa", starts_at: "2026-09-18T01:00:00+00:00",
          ends_at: "2026-09-18T03:00:00+00:00", location: "Nopa", note: null,
        },
      ],
    },
    {
      display_name: "Mara",
      color: "#56B4E9",
      join_order: 1,
      read_slug: "bbbbbbbbbbbbbbbbbbbbbbbb",
      tz_mode: "tzid",
      attending: [
        {
          api_id: "evt-SHARED", name: SHARED_TITLE, url_slug: "block-party",
          starts_at: "2026-09-16T23:30:00+00:00", ends_at: "2026-09-17T02:00:00+00:00",
          is_online: false, host_name: "Some Host", city: "San Francisco", region: "CA",
          sublocality: "SoMa", is_free: true, price_cents: null, rsvp_type: "OPEN",
          category: "OTHER", score: 0.82,
        },
      ],
      custom_events: [
        {
          event_id: "ce-busy", kind: "busy", visibility: "busy",
          starts_at: "2026-09-16T17:00:00+00:00", ends_at: null,
        },
      ],
    },
  ],
};

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("GroupCalendar - merged shared-event rendering", () => {
  const html = renderToStaticMarkup(
    <GroupCalendar
      view={VIEW}
      meMember={VIEW.members.find((m) => m.join_order === 1) ?? null}
      onChanged={() => {}}
    />,
  );

  it("renders the shared event exactly once despite two members attending", () => {
    expect(occurrences(html, SHARED_TITLE)).toBe(1);
  });

  it("marks the shared event as shared and names the count", () => {
    expect(html).toContain("grp-card--shared");
    expect(html).toMatch(/2 of the group going/);
  });

  it("shows both members on that one card: chips (A, M) AND spelled-out names", () => {
    const sharedCardStart = html.indexOf("grp-card--shared");
    const sharedCardEnd = html.indexOf("</li>", sharedCardStart);
    const sharedCard = html.slice(sharedCardStart, sharedCardEnd);
    expect(occurrences(sharedCard, "member-chip")).toBeGreaterThanOrEqual(2);
    expect(sharedCard).toContain(">A<");
    expect(sharedCard).toContain(">M<");
    // meJoinOrder = 1 (Mara), so the other attendee is spelled out and self is "You".
    expect(sharedCard).toContain("grp-card__attendee-names");
    expect(sharedCard).toMatch(/Alekos, You|You, Alekos/);
  });

  it("keeps the solo event as its own single row", () => {
    expect(occurrences(html, SOLO_TITLE)).toBe(1);
    expect(html).not.toMatch(new RegExp(`${SOLO_TITLE}[\\s\\S]*of the group going`));
  });

  it("distinguishes custom events (dashed) from Luma ones", () => {
    expect(html).toContain("grp-card--custom");
    expect(html).toContain("Group dinner");
  });

  it("renders a busy meeting as an anonymous 'Busy' block with no leaked detail", () => {
    expect(html).toContain("grp-card--busy");
    expect(occurrences(html, ">Busy<")).toBeGreaterThanOrEqual(1);
  });

  it("keeps every trip night in the window (14 headings, Sep 14 - Sep 27)", () => {
    expect(occurrences(html, "grp__night-head")).toBe(14);
    expect(html).toContain("Sep 14");
    expect(html).toContain("Sep 27");
  });
});
