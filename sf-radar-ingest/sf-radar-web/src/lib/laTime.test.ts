import { describe, expect, it } from "vitest";
import { isoPlusMinutes, laWallClockToIso } from "./laTime";

describe("laWallClockToIso - SF wall clock to absolute instant", () => {
  it("September (PDT, UTC-7): 6:00 PM SF -> 01:00 UTC next day", () => {
    expect(laWallClockToIso("2026-09-16", "18:00")).toBe("2026-09-17T01:00:00.000Z");
  });

  it("midnight SF -> 07:00 UTC same day (PDT)", () => {
    expect(laWallClockToIso("2026-09-16", "00:00")).toBe("2026-09-16T07:00:00.000Z");
  });

  it("December (PST, UTC-8): 9:00 AM SF -> 17:00 UTC", () => {
    expect(laWallClockToIso("2026-12-10", "09:00")).toBe("2026-12-10T17:00:00.000Z");
  });

  it("round-trips: the instant, rendered back in LA, is the entered wall clock", () => {
    const iso = laWallClockToIso("2026-09-20", "13:37")!;
    const back = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
    expect(back).toBe("2026-09-20, 13:37");
  });

  it("does not depend on the process timezone", () => {
    // Same answer regardless of what TZ the runner is in — the function only
    // ever consults an explicit America/Los_Angeles formatter.
    expect(laWallClockToIso("2026-09-16", "18:00")).toBe("2026-09-17T01:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(laWallClockToIso("2026-9-16", "18:00")).toBeNull();
    expect(laWallClockToIso("2026-09-16", "6pm")).toBeNull();
    expect(laWallClockToIso("", "")).toBeNull();
  });
});

describe("isoPlusMinutes", () => {
  it("adds the default 45-minute meeting duration", () => {
    expect(isoPlusMinutes("2026-09-17T01:00:00.000Z", 45)).toBe("2026-09-17T01:45:00.000Z");
  });
  it("rolls over the hour and day", () => {
    expect(isoPlusMinutes("2026-09-17T23:30:00.000Z", 45)).toBe("2026-09-18T00:15:00.000Z");
  });
});
