import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PlanActions from "./PlanActions";

/**
 * First-paint structure of the hub: the three sections, in order, and the
 * timezone control living *inside* the CALENDAR section as a nested
 * <details>, not as a standalone block. (No localStorage in the test env, so
 * this renders the "not in a group / no share link yet" state.)
 */
describe("PlanActions hub - section layout", () => {
  const html = renderToStaticMarkup(
    <PlanActions attendingEvents={[]} loggedNights={[]} startDate="2026-09-14" />,
  );

  it("has an id the scroll affordance can target", () => {
    expect(html).toContain('id="plan-hub"');
  });

  it("renders GROUP, SHARE MY PLAN, CALENDAR in that order", () => {
    const g = html.indexOf(">Group<");
    const s = html.indexOf(">Share my plan<");
    const c = html.indexOf(">Calendar<");
    expect(g).toBeGreaterThan(-1);
    expect(s).toBeGreaterThan(g);
    expect(c).toBeGreaterThan(s);
  });

  it("offers Create / Join in the GROUP section when not in a group", () => {
    expect(html).toContain("Create a group");
    expect(html).toContain("Join with an invite link");
  });

  it("nests the timezone format as a <details> inside CALENDAR, after the feed note", () => {
    const cal = html.indexOf(">Calendar<");
    const tz = html.indexOf("tz-toggle-wrap");
    expect(tz).toBeGreaterThan(cal);
    expect(html).toMatch(/<details class="tz-toggle-wrap"/);
    // both radio options still present
    expect(html).toContain("San Francisco timezone");
    expect(html).toContain("Show SF times as-is");
  });

  it("shows 'Create a share link' before any link exists", () => {
    expect(html).toContain("Create a share link");
  });
});
