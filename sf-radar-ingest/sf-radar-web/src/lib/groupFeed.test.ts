import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { groupFeedFilename, groupFeedIcs } from "../../api/_lib/groupFeed";

// Shape of group_feed_by_token()'s rows (migration 003/005). Two members on
// one Luma event, one shared custom event, one busy meeting.
const ROWS = [
  {
    group_name: "Sept SF crew",
    member_name: "Alekos",
    join_order: 0,
    is_busy: false,
    source: "luma",
    source_id: "evt-blockparty01",
    title: "AI Biotech Block Party",
    starts_at: "2026-09-16T23:30:00+00:00",
    ends_at: "2026-09-17T02:00:00+00:00",
    location: null,
    note: null,
    url_slug: "ai-biotech-block-party",
  },
  {
    group_name: "Sept SF crew",
    member_name: "Mara",
    join_order: 1,
    is_busy: false,
    source: "luma",
    source_id: "evt-blockparty01",
    title: "AI Biotech Block Party",
    starts_at: "2026-09-16T23:30:00+00:00",
    ends_at: "2026-09-17T02:00:00+00:00",
    location: null,
    note: null,
    url_slug: "ai-biotech-block-party",
  },
  {
    group_name: "Sept SF crew",
    member_name: "Alekos",
    join_order: 0,
    is_busy: false,
    source: "custom",
    source_id: "3f67fbc9-8877-4e7b-b35d-dabd561027e4",
    title: "Group dinner, Nopa; table for 6",
    starts_at: "2026-09-18T01:30:00+00:00",
    ends_at: "2026-09-18T03:30:00+00:00",
    location: "Nopa, 560 Divisadero",
    note: "Booked under Alekos",
    url_slug: null,
  },
  {
    group_name: "Sept SF crew",
    member_name: "Mara",
    join_order: 1,
    is_busy: true,
    source: "custom",
    source_id: "d856c130-a2e6-458b-b298-c33c3c15716e",
    title: "Busy",
    starts_at: "2026-09-16T17:00:00+00:00",
    ends_at: "2026-09-16T17:45:00+00:00",
    location: null,
    note: null,
    url_slug: null,
  },
];

function parse(ics: string): ICAL.Component {
  return new ICAL.Component(ICAL.parse(ics));
}
function summaries(cal: ICAL.Component): string[] {
  return cal.getAllSubcomponents("vevent").map((v) => v.getFirstPropertyValue("summary") as string);
}

describe("groupFeedIcs - the combined group feed", () => {
  it("serves a parseable calendar: one VEVENT per (member, event), [Name]-prefixed", () => {
    const r = groupFeedIcs(ROWS, "Sept SF crew");
    expect(r.status).toBe(200);
    expect(r.filename).toBe("Sept-SF-crew-sf-radar-group.ics");

    const cal = parse(r.body);
    expect(cal.getFirstPropertyValue("x-wr-calname")).toBe("Sept SF crew — SF Radar group");
    const vevents = cal.getAllSubcomponents("vevent");
    expect(vevents).toHaveLength(4);

    const s = summaries(cal).sort();
    expect(s).toEqual([
      "[Alekos] AI Biotech Block Party",
      "[Alekos] Group dinner, Nopa; table for 6",
      "[Mara] AI Biotech Block Party",
      "[Mara] Busy",
    ]);
  });

  it("carries a VTIMEZONE for America/Los_Angeles and TZID-tagged times", () => {
    const cal = parse(groupFeedIcs(ROWS, "x").body);
    const vtz = cal.getFirstSubcomponent("vtimezone");
    expect(vtz?.getFirstPropertyValue("tzid")).toBe("America/Los_Angeles");
    const dtstart = cal
      .getAllSubcomponents("vevent")[0]
      .getFirstProperty("dtstart");
    expect(dtstart?.getParameter("tzid")).toBe("America/Los_Angeles");
  });

  it("the same Luma event for two members gets two DISTINCT stable UIDs", () => {
    const cal = parse(groupFeedIcs(ROWS, "x").body);
    const uids = cal.getAllSubcomponents("vevent").map((v) => v.getFirstPropertyValue("uid"));
    expect(new Set(uids).size).toBe(4);
    expect(uids).toContain("luma-evt-blockparty01-m0@sf-radar-group");
    expect(uids).toContain("luma-evt-blockparty01-m1@sf-radar-group");
    // stable across a rebuild
    const uids2 = parse(groupFeedIcs(ROWS, "x").body)
      .getAllSubcomponents("vevent")
      .map((v) => v.getFirstPropertyValue("uid"));
    expect(uids2.sort()).toEqual([...uids].sort());
  });

  it("a busy row is '[Name] Busy' with NO location or description", () => {
    const cal = parse(groupFeedIcs(ROWS, "x").body);
    const busy = cal
      .getAllSubcomponents("vevent")
      .find((v) => v.getFirstPropertyValue("summary") === "[Mara] Busy")!;
    expect(busy.getFirstPropertyValue("location")).toBeNull();
    expect(busy.getFirstPropertyValue("description")).toBeNull();
  });

  it("escapes TEXT specials and never splits a line past 75 octets", () => {
    const body = groupFeedIcs(ROWS, "x").body;
    // ';' and ',' in the dinner title are backslash-escaped in the raw stream
    expect(body).toContain("Group dinner\\, Nopa\\; table for 6");
    for (const line of body.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    expect(body.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("a CRLF injected into member_name cannot forge a VEVENT", () => {
    const hostile = [
      {
        ...ROWS[0],
        member_name: "Mallory\r\nBEGIN:VEVENT\r\nUID:forged\r\nEND:VEVENT",
      },
    ];
    const body = groupFeedIcs(hostile, "x").body;
    const cal = parse(body);
    expect(cal.getAllSubcomponents("vevent")).toHaveLength(1);
    expect(body.split("\r\n").filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
  });

  it("zero rows still yields a valid empty VCALENDAR (200), not a 404", () => {
    const r = groupFeedIcs([], "Sept SF crew");
    expect(r.status).toBe(200);
    const cal = parse(r.body);
    expect(cal.getAllSubcomponents("vevent")).toHaveLength(0);
    expect(cal.getFirstPropertyValue("x-wr-calname")).toBe("Sept SF crew — SF Radar group");
  });

  it("tolerates junk input without throwing", () => {
    for (const junk of [null, undefined, "boom", 42, {}, [null], [{ starts_at: null }]]) {
      expect(groupFeedIcs(junk, "x").status).toBe(200);
    }
  });
});

describe("groupFeedFilename", () => {
  it("keeps only letters/digits/hyphen", () => {
    expect(groupFeedFilename('Al"eks\r\n; crew')).toBe("Al-eks-crew-sf-radar-group.ics");
    expect(groupFeedFilename("   ")).toBe("sf-radar-group.ics");
  });
});
