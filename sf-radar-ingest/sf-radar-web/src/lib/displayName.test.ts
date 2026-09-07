import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MAX, isValidDisplayName, normalizeDisplayName } from "./displayName";

const ZWSP = "​";
const RLO = "‮";
const PDF = "‬";
const BOM = "﻿";
const BEL = "";

describe("normalizeDisplayName", () => {
  it("keeps ordinary names, trimmed", () => {
    expect(normalizeDisplayName("Alekos")).toBe("Alekos");
    expect(normalizeDisplayName("  Maria  ")).toBe("Maria");
    expect(normalizeDisplayName("Γιάννης")).toBe("Γιάννης");
    expect(normalizeDisplayName("Anna-Lena")).toBe("Anna-Lena");
  });

  it("collapses internal whitespace runs", () => {
    expect(normalizeDisplayName("Van  der   Berg")).toBe("Van der Berg");
    expect(normalizeDisplayName("a\tb")).toBe("a b");
  });

  it("rejects empty / whitespace-only as null", () => {
    expect(normalizeDisplayName("")).toBeNull();
    expect(normalizeDisplayName("   ")).toBeNull();
    expect(normalizeDisplayName("\t\n")).toBeNull();
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName(undefined)).toBeNull();
  });

  it("strips control characters and invisible bidi/format characters", () => {
    expect(normalizeDisplayName(`Ale${BEL}kos`)).toBe("Alekos");
    expect(normalizeDisplayName(`Ma${ZWSP}ria`)).toBe("Maria");
    expect(normalizeDisplayName(`${RLO}evil${PDF}`)).toBe("evil");
    expect(normalizeDisplayName(`${BOM}name`)).toBe("name");
    expect(normalizeDisplayName(BEL)).toBeNull();
    expect(normalizeDisplayName(ZWSP + ZWSP)).toBeNull();
  });

  it("caps at 40 code points, counting an emoji as one", () => {
    expect(normalizeDisplayName("x".repeat(50))).toHaveLength(DISPLAY_NAME_MAX);
    const emoji = "\u{1F600}".repeat(45); // 2 UTF-16 units each
    expect(Array.from(normalizeDisplayName(emoji)!)).toHaveLength(DISPLAY_NAME_MAX);
  });

  it("does NOT strip markup - escaping is the render layer's job", () => {
    expect(normalizeDisplayName("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
    expect(normalizeDisplayName("Bobby </b> Tables")).toBe("Bobby </b> Tables");
  });

  it("isValidDisplayName mirrors normalize", () => {
    expect(isValidDisplayName("Maria")).toBe(true);
    expect(isValidDisplayName("   ")).toBe(false);
    expect(isValidDisplayName(BEL)).toBe(false);
  });
});
