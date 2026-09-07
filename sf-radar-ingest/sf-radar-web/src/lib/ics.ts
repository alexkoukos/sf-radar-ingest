import type { EventLike } from "../types";
import { CATEGORY_LABELS } from "./categoryLabels";
import { locationLine } from "./eventFormat";

/**
 * Hand-rolled RFC 5545 iCalendar writer. Pure (no DOM), so it is shared by
 * the in-browser "Download .ics" button and the /api/feed serverless
 * function. The browser-only download wrapper lives in ./icsDownload.
 *
 * TWO timezone modes, chosen by the user at export/subscribe time:
 *
 *  - "tzid" (default): DTSTART/DTEND are LA wall-clock times tagged
 *    ;TZID=America/Los_Angeles, and the file carries a full VTIMEZONE with
 *    the US DST recurrence rules (2nd Sunday March -> PDT, 1st Sunday
 *    November -> PST). Semantically correct: a viewer in Athens sees the
 *    event at the right absolute instant, reminders fire correctly.
 *
 *  - "floating": DTSTART/DTEND are the same LA wall-clock numbers but with
 *    NO Z and NO TZID, so every calendar app shows the literal SF time
 *    regardless of the viewer's own timezone. Convenient for reading, but
 *    the event is not tied to a real instant.
 *
 * (This replaces the earlier "UTC, no VTIMEZONE" output.)
 *
 * DTSTAMP is always UTC, per spec. Line folding is octet-aware (never
 * splits a multi-byte UTF-8 char); TEXT values escape \ ; , and newlines.
 */

export type TzMode = "tzid" | "floating";

export const LA_TZID = "America/Los_Angeles";

const PRODID = "-//SF Radar//Trip Plan//EN";
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** LA wall-clock calendar parts for an absolute instant. */
function laWallParts(instant: Date): WallParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZID,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  let hour = Number.parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // some engines render midnight as "24"
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** "YYYYMMDDTHHMMSS" - local form, no zone designator. */
function formatLocal(p: WallParts): string {
  return (
    pad(p.year, 4) + pad(p.month) + pad(p.day) + "T" + pad(p.hour) + pad(p.minute) + pad(p.second)
  );
}

/** "YYYYMMDDTHHMMSSZ" - UTC basic format. */
function formatUtc(date: Date): string {
  return (
    pad(date.getUTCFullYear(), 4) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

/** Escape a TEXT value (RFC 5545 §3.3.11). Backslash first, on purpose. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/**
 * Fold a content line to <=75 octets (RFC 5545 §3.1). Continuation lines
 * begin with one space (74-octet budget). Counting is by UTF-8 byte length
 * but breaks only between characters, so multi-byte sequences stay intact.
 */
function foldLine(input: string): string {
  if (encoder.encode(input).length <= 75) return input;
  const pieces: string[] = [];
  let current = "";
  let bytes = 0;
  let isFirst = true;
  for (const ch of input) {
    const chBytes = encoder.encode(ch).length;
    const limit = isFirst ? 75 : 74;
    if (bytes + chBytes > limit) {
      pieces.push(current);
      current = ch;
      bytes = chBytes;
      isFirst = false;
    } else {
      current += ch;
      bytes += chBytes;
    }
  }
  pieces.push(current);
  return pieces.join("\r\n ");
}

function prop(nameAndParams: string, value: string): string {
  // Backstop against content-line injection: no property value may carry a
  // bare CR/LF and forge a new line (a fake VEVENT, ATTENDEE, etc). TEXT
  // values are already newline-escaped by escapeText; this also covers
  // UID/URL/DTSTAMP and any future non-TEXT property.
  const safe = value.replace(/[\r\n]+/g, " ");
  return foldLine(`${nameAndParams}:${safe}`);
}

// Canonical America/Los_Angeles VTIMEZONE. The RRULEs are the current US
// DST rules (Energy Policy Act 2005, in effect since 2007, no change
// scheduled), so they cover any trip window - not just this one.
const VTIMEZONE_LA = [
  "BEGIN:VTIMEZONE",
  `TZID:${LA_TZID}`,
  "X-LIC-LOCATION:America/Los_Angeles",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

function dtProp(name: "DTSTART" | "DTEND", instant: Date, tzMode: TzMode): string {
  const local = formatLocal(laWallParts(instant));
  return tzMode === "tzid" ? prop(`${name};TZID=${LA_TZID}`, local) : prop(name, local);
}

function toVevent(event: EventLike, dtstamp: string, tzMode: TzMode): string | null {
  if (!event.starts_at) return null;
  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) return null;

  const parsedEnd = event.ends_at ? new Date(event.ends_at) : null;
  const end =
    parsedEnd && !Number.isNaN(parsedEnd.getTime())
      ? parsedEnd
      : new Date(start.getTime() + DEFAULT_DURATION_MS);

  const category = CATEGORY_LABELS[event.category] ?? event.category;
  const score = event.score != null ? ` · Score ${Math.round(event.score * 100)}/100` : "";
  const descriptionParts = [`${category}${score}`];
  if (event.url_slug) descriptionParts.push(`https://luma.com/${event.url_slug}`);
  const location = locationLine(event);

  const rows = [
    "BEGIN:VEVENT",
    // api_id / url_slug are stored verbatim in the plan row and, via a
    // direct upsert_plan RPC call, fully attacker-controlled - escape them
    // exactly like the TEXT properties so a CRLF can't inject a forged event.
    prop("UID", `${escapeText(event.api_id)}@sf-radar`),
    prop("DTSTAMP", dtstamp),
    dtProp("DTSTART", start, tzMode),
    dtProp("DTEND", end, tzMode),
    prop("SUMMARY", escapeText(event.name)),
  ];
  if (location) rows.push(prop("LOCATION", escapeText(location)));
  rows.push(prop("DESCRIPTION", escapeText(descriptionParts.join("\n"))));
  if (event.url_slug) rows.push(prop("URL", escapeText(`https://luma.com/${event.url_slug}`)));
  rows.push("END:VEVENT");
  return rows.join("\r\n");
}

export interface IcsOptions {
  tzMode: TzMode;
  /** X-WR-CALNAME, e.g. "Alekos’ SF Radar plan". Defaults to "SF Radar plan". */
  calName?: string;
  /**
   * When true, 0 events yields a valid empty VCALENDAR instead of an error.
   * The live feed sets this so un-attending everything empties a subscribed
   * calendar rather than 500-ing; the download button leaves it off.
   */
  allowEmpty?: boolean;
}

export interface IcsResult {
  value: string | null;
  count: number;
  error?: string;
}

export function buildPlanIcs(events: EventLike[], options: IcsOptions): IcsResult {
  const tzMode = options.tzMode;
  const dtstamp = formatUtc(new Date());
  const vevents = events
    .map((event) => toVevent(event, dtstamp, tzMode))
    .filter((v): v is string => v !== null);

  if (vevents.length === 0 && !options.allowEmpty) {
    return { value: null, count: 0, error: "No attending events with a start time to export." };
  }

  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    prop("X-WR-CALNAME", escapeText(options.calName?.trim() || "SF Radar plan")),
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
  ];
  if (tzMode === "tzid") {
    head.push(`X-WR-TIMEZONE:${LA_TZID}`);
  }

  const parts = [...head];
  if (tzMode === "tzid") parts.push(VTIMEZONE_LA);
  parts.push(...vevents, "END:VCALENDAR", "");

  return { value: parts.join("\r\n"), count: vevents.length };
}
