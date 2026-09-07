import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import type { EventLike } from "../types";
import { buildPlanIcs } from "./ics";

// Real Luma events, frozen from the live get_dashboard_events RPC. No
// synthetic data. Event 2 carries an emoji (4-byte UTF-8), commas and an
// ampersand - the escaping + multi-byte-fold cases in one string.
const REAL_EVENTS = JSON.parse(
  readFileSync(fileURLToPath(new URL("../test-fixtures/real-events.json", import.meta.url)), "utf8"),
) as EventLike[];

// Same real events, but with ends_at blanked on one, to exercise the
// "+2h default end" path (every event Luma currently returns has an end).
const EVENTS_WITH_A_MISSING_END: EventLike[] = REAL_EVENTS.map((e, i) =>
  i === 2 ? { ...e, ends_at: null } : e,
);

function parse(ics: string): ICAL.Component {
  // ICAL.parse throws on malformed input - this is the "don't eyeball it" check.
  return new ICAL.Component(ICAL.parse(ics));
}

function crlfLines(ics: string): string[] {
  return ics.split("\r\n");
}

describe("buildPlanIcs - shared RFC 5545 shape (both modes)", () => {
  for (const tzMode of ["tzid", "floating"] as const) {
    describe(`tzMode=${tzMode}`, () => {
      const { value, count } = buildPlanIcs(REAL_EVENTS, { tzMode, calName: "Alekos’ SF Radar plan" });
      const ics = value as string;

      it("is non-empty and counts every event", () => {
        expect(ics).toBeTruthy();
        expect(count).toBe(REAL_EVENTS.length);
      });

      it("parses cleanly with ical.js", () => {
        expect(() => parse(ics)).not.toThrow();
      });

      it("has the VCALENDAR envelope", () => {
        const cal = parse(ics);
        expect(cal.name).toBe("vcalendar");
        expect(cal.getFirstPropertyValue("version")).toBe("2.0");
        expect(cal.getFirstPropertyValue("prodid")).toContain("SF Radar");
        expect(cal.getFirstPropertyValue("x-wr-calname")).toBe("Alekos’ SF Radar plan");
      });

      it("emits one VEVENT per event with a stable api_id-based UID", () => {
        const vevents = parse(ics).getAllSubcomponents("vevent");
        expect(vevents).toHaveLength(REAL_EVENTS.length);
        const uids = vevents.map((v) => v.getFirstPropertyValue("uid"));
        expect(uids).toEqual(REAL_EVENTS.map((e) => `${e.api_id}@sf-radar`));
        // stable across rebuilds (ignoring DTSTAMP)
        const again = (buildPlanIcs(REAL_EVENTS, { tzMode, calName: "Alekos’ SF Radar plan" }).value as string)
          .replace(/DTSTAMP:[0-9TZ]+/g, "DTSTAMP:X");
        expect(again).toBe(ics.replace(/DTSTAMP:[0-9TZ]+/g, "DTSTAMP:X"));
      });

      it("folds every line to <=75 octets without splitting a multi-byte char", () => {
        for (const line of crlfLines(ics)) {
          expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
        }
        // the emoji survived the round-trip intact
        expect(parse(ics).getAllSubcomponents("vevent").map((v) => v.getFirstPropertyValue("summary")))
          .toContain("🌐 Energy Generation Cluster: Plug-in Solar 101, Live Demo, & Deep Dive Q&A");
      });

      it("uses CRLF endings only, with a trailing CRLF", () => {
        expect(ics.endsWith("\r\n")).toBe(true);
        expect(/\r(?!\n)/.test(ics)).toBe(false);
        expect(/(?<!\r)\n/.test(ics)).toBe(false);
      });

      it("escapes commas/semicolons/backslashes in TEXT values", () => {
        // LOCATION for event 2 is "Financial District, San Francisco, California"
        expect(ics).toMatch(/LOCATION:[^\r\n]*District\\, San Francisco\\, California/);
        // raw commas only ever appear escaped inside VEVENT text
        const rawUnescapedComma = crlfLines(ics).some(
          (l) => /^(SUMMARY|LOCATION|DESCRIPTION|X-WR-CALNAME)[:;]/.test(l) && /(?<!\\),/.test(l),
        );
        expect(rawUnescapedComma).toBe(false);
      });

      it("defaults a missing end to start + 2h", () => {
        const withGap = buildPlanIcs(EVENTS_WITH_A_MISSING_END, { tzMode }).value as string;
        const v = parse(withGap)
          .getAllSubcomponents("vevent")
          .find((c) => c.getFirstPropertyValue("uid") === `${REAL_EVENTS[2].api_id}@sf-radar`)!;
        const start = v.getFirstProperty("dtstart")!.getFirstValue() as ICAL.Time;
        const end = v.getFirstProperty("dtend")!.getFirstValue() as ICAL.Time;
        expect(end.subtractDate(start).toSeconds()).toBe(2 * 60 * 60);
      });
    });
  }
});

describe("buildPlanIcs - tzMode=tzid", () => {
  const ics = buildPlanIcs(REAL_EVENTS, { tzMode: "tzid" }).value as string;

  it("carries a VTIMEZONE for America/Los_Angeles with both DST sub-components and RRULEs", () => {
    const vtz = parse(ics).getFirstSubcomponent("vtimezone")!;
    expect(vtz).toBeTruthy();
    expect(vtz.getFirstPropertyValue("tzid")).toBe("America/Los_Angeles");

    const daylight = vtz.getFirstSubcomponent("daylight")!;
    const standard = vtz.getFirstSubcomponent("standard")!;
    expect(daylight.getFirstPropertyValue("tzname")).toBe("PDT");
    expect(standard.getFirstPropertyValue("tzname")).toBe("PST");
    expect(String(daylight.getFirstPropertyValue("tzoffsetto"))).toBe("-07:00");
    expect(String(standard.getFirstPropertyValue("tzoffsetto"))).toBe("-08:00");
    expect(daylight.getFirstPropertyValue("rrule")).toBeTruthy();
    expect(standard.getFirstPropertyValue("rrule")).toBeTruthy();
  });

  it("tags DTSTART/DTEND with TZID and resolves to the correct absolute instant", () => {
    const cal = parse(ics);
    const vevent = cal
      .getAllSubcomponents("vevent")
      .find((c) => c.getFirstPropertyValue("uid") === `${REAL_EVENTS[0].api_id}@sf-radar`)!;

    const dtstart = vevent.getFirstProperty("dtstart")!;
    expect(dtstart.getParameter("tzid")).toBe("America/Los_Angeles");

    // Register the VTIMEZONE, then resolve the local time to UTC.
    const tz = new ICAL.Timezone(cal.getFirstSubcomponent("vtimezone")!);
    const local = dtstart.getFirstValue() as ICAL.Time;
    local.zone = tz;
    // 2026-09-09T00:00:00Z is Sept 8, 17:00 in LA (PDT, -07:00).
    expect(local.toString()).toBe("2026-09-08T17:00:00");
    const asUtc = local.convertToZone(ICAL.Timezone.utcTimezone);
    expect(asUtc.toString().replace(/Z$/, "")).toBe(REAL_EVENTS[0].starts_at!.replace("+00:00", ""));
  });
});

describe("buildPlanIcs - tzMode=floating", () => {
  const ics = buildPlanIcs(REAL_EVENTS, { tzMode: "floating" }).value as string;

  it("has no VTIMEZONE and no TZID/Z on DTSTART", () => {
    const cal = parse(ics);
    expect(cal.getFirstSubcomponent("vtimezone")).toBeNull();
    const dtstartLine = crlfLines(ics).find((l) => l.startsWith("DTSTART"))!;
    expect(dtstartLine).toMatch(/^DTSTART:\d{8}T\d{6}$/); // no ;TZID=, no trailing Z
  });

  it("keeps the SF wall-clock numbers as the literal local time", () => {
    const vevent = parse(ics).getAllSubcomponents("vevent")[0];
    const local = vevent.getFirstProperty("dtstart")!.getFirstValue() as ICAL.Time;
    expect(local.isDate).toBe(false);
    // same wall-clock as the tzid version, just untethered from a zone
    expect(local.toString()).toBe("2026-09-08T17:00:00");
  });
});
