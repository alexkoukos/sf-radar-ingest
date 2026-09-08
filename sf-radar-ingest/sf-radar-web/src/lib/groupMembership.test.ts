import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearGroupMembership,
  loadGroupMembership,
  parseGroupSlug,
  saveGroupMembership,
} from "./groupMembership";

const SLUG = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe("parseGroupSlug", () => {
  it("pulls a 32-hex slug out of a full invite URL", () => {
    expect(parseGroupSlug(`https://sf-radar-ingest.vercel.app/group/${SLUG}`)).toBe(SLUG);
    expect(parseGroupSlug(`  ${SLUG}  `)).toBe(SLUG);
    expect(parseGroupSlug(`/group/${SLUG.toUpperCase()}`)).toBe(SLUG);
  });
  it("returns null when there's no slug-shaped token", () => {
    expect(parseGroupSlug("not a link")).toBeNull();
    expect(parseGroupSlug("https://example.com/group/tooshort")).toBeNull();
  });
});

describe("group membership localStorage round-trip", () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const FEED = "aB3-_dEf".repeat(4); // 32 chars of [A-Za-z0-9_-]

  it("saves and reloads a membership", () => {
    saveGroupMembership({
      slug: SLUG,
      name: "Sept crew",
      color: "#56B4E9",
      joinOrder: 2,
      feedToken: FEED,
    });
    expect(loadGroupMembership()).toEqual({
      slug: SLUG,
      name: "Sept crew",
      color: "#56B4E9",
      joinOrder: 2,
      feedToken: FEED,
    });
  });

  it("clear removes it", () => {
    saveGroupMembership({ slug: SLUG, name: "x", color: "#000000", joinOrder: 0, feedToken: FEED });
    clearGroupMembership();
    expect(loadGroupMembership()).toBeNull();
  });

  it("tolerates a breadcrumb written before the feed shipped (no feedToken)", () => {
    localStorage.setItem(
      "sfradar:v1:group",
      JSON.stringify({ slug: SLUG, name: "old", color: "#E69F00", joinOrder: 0 }),
    );
    expect(loadGroupMembership()?.feedToken).toBe("");
  });

  it("rejects a stored blob with a bad slug", () => {
    localStorage.setItem("sfradar:v1:group", JSON.stringify({ slug: "nope", name: "x" }));
    expect(loadGroupMembership()).toBeNull();
  });

  it("falls back on a missing/!hex colour rather than dropping the row", () => {
    localStorage.setItem(
      "sfradar:v1:group",
      JSON.stringify({ slug: SLUG, name: "x", color: "blurple", joinOrder: 1 }),
    );
    expect(loadGroupMembership()?.color).toBe("#4D4D4D");
  });
});
