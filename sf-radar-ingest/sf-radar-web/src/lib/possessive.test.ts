import { describe, expect, it } from "vitest";
import { APOSTROPHE, possessive, possessivePhrase } from "./possessive";

describe("possessive", () => {
  it("adds ’s to names ending in a normal consonant or vowel", () => {
    expect(possessive("Maria")).toBe(`Maria${APOSTROPHE}s`);
    expect(possessive("Dimitri")).toBe(`Dimitri${APOSTROPHE}s`);
    expect(possessive("Renée")).toBe(`Renée${APOSTROPHE}s`);
  });

  it("adds a bare apostrophe to names ending in s", () => {
    expect(possessive("Alekos")).toBe(`Alekos${APOSTROPHE}`);
    expect(possessive("Alexis")).toBe(`Alexis${APOSTROPHE}`);
  });

  it("adds a bare apostrophe to names ending in x or z", () => {
    expect(possessive("Marx")).toBe(`Marx${APOSTROPHE}`);
    expect(possessive("Buzz")).toBe(`Buzz${APOSTROPHE}`);
    expect(possessive("Beatrix")).toBe(`Beatrix${APOSTROPHE}`);
  });

  it("treats Greek sigma endings as sibilant (final ς and uppercase Σ)", () => {
    expect(possessive("Γιάννης")).toBe(`Γιάννης${APOSTROPHE}`); // final sigma ς
    expect(possessive("ΑΛΕΚΟΣ")).toBe(`ΑΛΕΚΟΣ${APOSTROPHE}`); // uppercase Σ -> σ
    expect(possessive("Κώστας")).toBe(`Κώστας${APOSTROPHE}`);
    expect(possessive("Μαρία")).toBe(`Μαρία${APOSTROPHE}s`); // ends in vowel
  });

  it("works on the final grapheme, not the final code unit", () => {
    // "é" as e + combining acute (U+0065 U+0301) must be read as one grapheme.
    expect(possessive("José")).toBe(`José${APOSTROPHE}s`);
  });

  it("handles single-character names", () => {
    expect(possessive("A")).toBe(`A${APOSTROPHE}s`);
    expect(possessive("S")).toBe(`S${APOSTROPHE}`);
    expect(possessive("Z")).toBe(`Z${APOSTROPHE}`);
    expect(possessive("O")).toBe(`O${APOSTROPHE}s`);
  });

  it("leaves a name already ending in an apostrophe alone, normalising ASCII to typographic", () => {
    expect(possessive(`Ross${APOSTROPHE}`)).toBe(`Ross${APOSTROPHE}`);
    expect(possessive("Ross'")).toBe(`Ross${APOSTROPHE}`);
    expect(possessive("Jesus'")).toBe(`Jesus${APOSTROPHE}`);
  });

  it("returns an empty string for empty or whitespace input", () => {
    expect(possessive("")).toBe("");
    expect(possessive("   ")).toBe("");
    expect(possessive("\t\n ")).toBe("");
  });

  it("trims surrounding whitespace before applying the rule", () => {
    expect(possessive("  Maria  ")).toBe(`Maria${APOSTROPHE}s`);
    expect(possessive(" Alekos ")).toBe(`Alekos${APOSTROPHE}`);
  });

  it("always uses U+2019, never the ASCII quote", () => {
    expect(possessive("Maria")).not.toContain("'");
    expect(possessive("Alekos")).not.toContain("'");
    expect(possessive("Maria")).toContain("’");
  });
});

describe("possessivePhrase", () => {
  it("builds '<name>’s <noun>'", () => {
    expect(possessivePhrase("Alekos", "SF Radar plan")).toBe(`Alekos${APOSTROPHE} SF Radar plan`);
    expect(possessivePhrase("Maria", "plan")).toBe(`Maria${APOSTROPHE}s plan`);
  });

  it("falls back to the bare noun when there is no name", () => {
    expect(possessivePhrase("", "SF Radar plan")).toBe("SF Radar plan");
    expect(possessivePhrase("   ", "SF Radar plan")).toBe("SF Radar plan");
  });
});
