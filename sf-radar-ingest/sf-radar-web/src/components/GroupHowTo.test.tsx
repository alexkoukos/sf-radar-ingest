import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GroupHowTo from "./GroupHowTo";

/**
 * Guards the verified menu paths against a well-meaning "simplify" — these
 * were checked against current vendor docs (Sept 2026) and are the whole
 * point of the panel.
 */
describe("GroupHowTo", () => {
  const html = renderToStaticMarkup(<GroupHowTo />);

  it("is a collapsed details panel", () => {
    expect(html).toMatch(/^<details class="grp-howto"/);
    expect(html).not.toContain("<details open");
  });

  it("carries the current subscribe path for each app", () => {
    expect(html).toContain("Other calendars"); // Google
    expect(html).toContain("From URL");
    expect(html).toContain("New Calendar Subscription"); // Apple macOS
    expect(html).toContain("Add Subscription Calendar"); // Apple iOS
    expect(html).toContain("Subscribe from web"); // Outlook
  });

  it("states the subscribe-vs-download and timezone caveats", () => {
    expect(html).toMatch(/8 to 24 hours/);
    expect(html).toContain("America/Los_Angeles");
    expect(html).toMatch(/frozen copy/i);
  });
});
