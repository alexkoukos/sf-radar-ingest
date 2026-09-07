import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { feedFilename, planFeedIcs } from "./planFeed";

// The exact shape get_plan returns since migration 004: a one-element array
// (SETOF row) for a hit, [] for a miss. Frozen from the live RPC for the
// plan slug that crashed the feed function in prod.
const GET_PLAN_HIT = [
  {
    slug: "3e9f2e533b728ca5d6bd90a4b6eb29bd",
    display_name: "Alekos",
    tz_mode: "tzid",
    start_date: "2026-09-14",
    attending: [
      { city: "San Francisco", name: "Demo Night @ WorkOS (September)", score: 0.8666, api_id: "evt-mvx29a51ZM7pYFJ", region: "California", ends_at: "2026-09-15T03:00:00+00:00", is_free: true, category: "DEMO_DAY", url_slug: "demo-night-sept2026", host_name: "Michael Grinich", is_online: false, rsvp_type: "WAITLIST", starts_at: "2026-09-15T00:30:00+00:00", price_cents: null, sublocality: "Union Square" },
      { city: "San Francisco", name: "AI Demo Series: September Edition - Startup Grind", score: 0.85, api_id: "evt-KlSwWYrXBRhSU9Z", region: "California", ends_at: "2026-09-18T03:00:00+00:00", is_free: true, category: "DEMO_DAY", url_slug: "e36889su", host_name: "Startup Grind", is_online: false, rsvp_type: "APPLICATION", starts_at: "2026-09-18T00:30:00+00:00", price_cents: null, sublocality: "Belden Place" },
      { city: "San Francisco", name: "ðŸ”— Founder Peer Group Meetup", score: 0.8333, api_id: "evt-SDOJWCGzGPmpWdh", region: "California", ends_at: "2026-09-17T02:00:00+00:00", is_free: true, category: "FOUNDER_SOCIAL", url_slug: "joxi6n07", host_name: "9Zero", is_online: false, rsvp_type: "APPLICATION", starts_at: "2026-09-17T00:00:00+00:00", price_cents: null, sublocality: "Financial District" },
      { city: "San Francisco", name: "Antler SF After Dark", score: 0.6833, api_id: "evt-1kzl903war36yBT", region: "California", ends_at: "2026-09-18T05:00:00+00:00", is_free: true, category: "OTHER", url_slug: "antlerus-2x9i", host_name: "Helen Park", is_online: false, rsvp_type: "APPLICATION", starts_at: "2026-09-17T23:00:00+00:00", price_cents: null, sublocality: "China Basin" },
    ],
    logged: [],
    created_at: "2026-09-07T22:12:40.051289+00:00",
    updated_at: "2026-09-07T22:12:40.150237+00:00",
  },
];

function parse(ics: string): ICAL.Component {
  return new ICAL.Component(ICAL.parse(ics));
}

describe("planFeedIcs - the /api/feed/<slug>.ics core", () => {
  it("serves a real 4-event plan: 200, parseable, one VEVENT per attending event", () => {
    const r = planFeedIcs(GET_PLAN_HIT);
    expect(r.status).toBe(200);
    expect(r.filename).toBe("Alekos-sf-radar-plan.ics");

    const cal = parse(r.body);
    expect(cal.name).toBe("vcalendar");
    expect(cal.getFirstPropertyValue("x-wr-calname")).toBe("Alekos’ SF Radar plan");
    expect(cal.getAllSubcomponents("vevent")).toHaveLength(4);
    // every line still within the RFC 5545 octet budget
    for (const line of r.body.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("returns 404 for an unknown slug (empty array from get_plan)", () => {
    expect(planFeedIcs([]).status).toBe(404);
  });

  it("returns 404 for a legacy all-null composite row", () => {
    expect(planFeedIcs([{ slug: null, attending: null, tz_mode: null }]).status).toBe(404);
  });

  it("tolerates a bare object (pre-004 RETURNS-plans shape)", () => {
    const r = planFeedIcs({ slug: "x".repeat(20), display_name: "Sam", tz_mode: "floating", attending: [] });
    expect(r.status).toBe(200);
    expect(parse(r.body).getAllSubcomponents("vevent")).toHaveLength(0);
  });

  it("does not throw on null / string / empty-object input", () => {
    for (const junk of [null, undefined, "boom", 42, {}, [null], [{}]]) {
      expect(planFeedIcs(junk).status).toBe(404);
    }
  });

  it("a plan with zero attending events still yields a valid empty calendar", () => {
    const r = planFeedIcs([{ slug: "y".repeat(20), display_name: "", tz_mode: "tzid", attending: [] }]);
    expect(r.status).toBe(200);
    expect(() => parse(r.body)).not.toThrow();
  });

  it("a hostile snapshot (CRLF in api_id / url_slug) degrades safely, never crashes", () => {
    const r = planFeedIcs([
      {
        slug: "z".repeat(20),
        display_name: "Mallory",
        tz_mode: "tzid",
        attending: [
          {
            api_id: "x\r\nBEGIN:VEVENT\r\nUID:forged\r\nEND:VEVENT",
            url_slug: "ok\r\nATTENDEE:mailto:victim@example.com",
            name: "Legit\r\nSUMMARY:forged",
            starts_at: "2026-09-15T00:30:00+00:00",
            ends_at: "2026-09-15T02:00:00+00:00",
            is_online: false,
            category: "OTHER",
          },
        ],
      },
    ]);
    expect(r.status).toBe(200);
    const lines = r.body.split("\r\n");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.some((l) => /^ATTENDEE[:;]/.test(l))).toBe(false);
    expect(() => parse(r.body)).not.toThrow();
  });
});

describe("feedFilename", () => {
  it("keeps only letters/digits/hyphen and never emits a header-breaking char", () => {
    expect(feedFilename('Al"eks\r\n; drop')).toBe("Al-eks-drop-sf-radar-plan.ics");
    expect(feedFilename("")).toBe("sf-radar-plan.ics");
    expect(feedFilename("   ")).toBe("sf-radar-plan.ics");
  });
});
