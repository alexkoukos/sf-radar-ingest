/**
 * SF wall-clock -> absolute instant. The custom-event form collects a date
 * and time the user means as *San Francisco local*; the DB stores an
 * absolute `timestamptz`. The dev machine is in Athens, so this conversion
 * must never touch the JS engine's own timezone.
 *
 * Method: treat the entered wall clock as if it were UTC, ask what LA's
 * offset is at that rough instant, correct by it, then re-measure once (that
 * second pass makes the one ambiguous DST-fall-back hour land on the earlier
 * of its two instants, and the skipped spring-forward hour on the next valid
 * one — neither case occurs in a mid-September trip, but it costs nothing).
 */

const laParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** ms that LA wall-clock is ahead of UTC wall-clock at the given instant (negative — LA is behind). */
function laOffsetMs(atUtcMs: number): number {
  const p: Record<string, string> = {};
  for (const part of laParts.formatToParts(new Date(atUtcMs))) {
    if (part.type !== "literal") p[part.type] = part.value;
  }
  let hour = Number(p.hour);
  if (hour === 24) hour = 0; // some engines print midnight as "24"
  const laWallAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    hour,
    Number(p.minute),
    Number(p.second),
  );
  return laWallAsUtc - atUtcMs;
}

/**
 * `dateStr` "YYYY-MM-DD" + `timeStr` "HH:mm", both read as SF local time,
 * to an ISO-8601 instant string (UTC, "…Z"). Returns null for malformed input.
 */
export function laWallClockToIso(dateStr: string, timeStr: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dm || !tm) return null;

  const wallAsUtc = Date.UTC(
    Number(dm[1]),
    Number(dm[2]) - 1,
    Number(dm[3]),
    Number(tm[1]),
    Number(tm[2]),
  );
  if (Number.isNaN(wallAsUtc)) return null;

  let instant = wallAsUtc - laOffsetMs(wallAsUtc);
  instant = wallAsUtc - laOffsetMs(instant);
  return new Date(instant).toISOString();
}

/** Add whole minutes to an ISO instant, returning a new ISO instant. */
export function isoPlusMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
