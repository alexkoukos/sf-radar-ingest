import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CustomEventForm from "./CustomEventForm";
import type { OwnedCustomEvent } from "../lib/groupMerge";

const base = {
  planSlug: "a".repeat(20),
  editKey: "b".repeat(48),
  windowStart: "2026-09-14",
  windowEnd: "2026-09-27",
  onSaved: () => {},
  onCancel: () => {},
};

/** Which visibility radio is checked in the rendered markup (radios render in
 *  the fixed order shared, busy, private). */
function checkedVisibility(html: string): string | null {
  const order = ["shared", "busy", "private"];
  const idx = html
    .split('name="ce-vis"')
    .slice(1)
    .findIndex((seg) => /^[^>]*checked/.test(seg));
  return idx >= 0 ? order[idx] : null;
}

describe("CustomEventForm - defaults", () => {
  it("a fresh form is a Meeting with visibility defaulted to 'busy'", () => {
    const html = renderToStaticMarkup(<CustomEventForm {...base} />);
    // Meeting radio checked
    expect(html).toMatch(/name="ce-kind"[^>]*checked/);
    // the meeting-only "Who with" field is present
    expect(html).toContain("Who with");
    // busy is the checked visibility
    expect(checkedVisibility(html)).toBe("busy");
    expect(html).toContain("(default for meetings)");
  });

  it("editing an existing shared generic event keeps kind=Event and visibility=shared", () => {
    const existing: OwnedCustomEvent = {
      kind: "custom",
      owner: { join_order: 0, display_name: "Alekos", color: "#E69F00", is_me: true },
      custom: {
        event_id: "ce1",
        kind: "generic",
        visibility: "shared",
        title: "Group dinner",
        starts_at: "2026-09-18T01:00:00.000Z",
        ends_at: "2026-09-18T03:00:00.000Z",
        location: "Nopa",
        note: null,
      },
    };
    const html = renderToStaticMarkup(<CustomEventForm {...base} existing={existing} />);
    expect(checkedVisibility(html)).toBe("shared");
    expect(html).toContain('value="Group dinner"');
    // Event kind -> no meeting fields
    expect(html).not.toContain("Who with");
  });
});
