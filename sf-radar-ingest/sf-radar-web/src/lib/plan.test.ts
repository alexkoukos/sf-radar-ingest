import { describe, expect, it } from "vitest";
import { feedUrls } from "./plan";

describe("feedUrls", () => {
  const u = feedUrls("3e9f2e533b728ca5d6bd90a4b6eb29bd", "https://sf-radar-ingest.vercel.app");

  it("builds the https / webcal / share-page forms", () => {
    expect(u.https).toBe("https://sf-radar-ingest.vercel.app/feed/3e9f2e533b728ca5d6bd90a4b6eb29bd.ics");
    expect(u.webcal).toBe("webcal://sf-radar-ingest.vercel.app/feed/3e9f2e533b728ca5d6bd90a4b6eb29bd.ics");
    expect(u.page).toBe("https://sf-radar-ingest.vercel.app/plan/3e9f2e533b728ca5d6bd90a4b6eb29bd");
  });

  it("Google deep link uses calendar/render + a raw webcal:// cid (the working form)", () => {
    expect(u.google).toBe(
      "https://calendar.google.com/calendar/render?cid=webcal://sf-radar-ingest.vercel.app/feed/3e9f2e533b728ca5d6bd90a4b6eb29bd.ics",
    );
    expect(u.google).not.toContain("/calendar/r?"); // not the SPA-router path
    expect(u.google).toContain("cid=webcal://"); // scheme, not https:, not %3A%2F%2F
  });
});
