import { describe, expect, it } from "vitest";
import {
  MAX_PASSPHRASE_CHARS,
  MIN_PASSPHRASE_CHARS,
  normalizePassphrase,
  passphraseLengthError,
} from "../../api/_lib/passphrase";

describe("normalizePassphrase - the ONE transform shared by set + verify", () => {
  it("applies trim, then NFC, then lowercase - in that order", () => {
    expect(normalizePassphrase("  Blue Fox  ")).toBe("blue fox");
    // é as U+0065 U+0301 (NFD) must fold to U+00E9 (NFC) so it matches the
    // same passphrase typed on a keyboard that produces the precomposed form.
    expect(normalizePassphrase("Café")).toBe(normalizePassphrase("café"));
    expect(normalizePassphrase("CAFÉ")).toBe("café");
  });

  it("returns '' for non-strings (so the caller rejects them)", () => {
    for (const junk of [undefined, null, 42, {}, []]) {
      expect(normalizePassphrase(junk)).toBe("");
    }
  });
});

describe("passphraseLengthError - counted in code points, post-normalize", () => {
  it("accepts 4-64 characters", () => {
    expect(passphraseLengthError("a".repeat(MIN_PASSPHRASE_CHARS))).toBeNull();
    expect(passphraseLengthError("a".repeat(MAX_PASSPHRASE_CHARS))).toBeNull();
  });

  it("rejects too short / too long", () => {
    expect(passphraseLengthError("abc")).toMatch(/at least/);
    expect(passphraseLengthError("a".repeat(MAX_PASSPHRASE_CHARS + 1))).toMatch(/at most/);
  });

  it("counts an emoji as one character, not two UTF-16 units", () => {
    // 4 astral code points = 8 UTF-16 units; must be treated as length 4 (ok).
    expect(passphraseLengthError("\u{1F600}\u{1F601}\u{1F602}\u{1F603}")).toBeNull();
  });
});
