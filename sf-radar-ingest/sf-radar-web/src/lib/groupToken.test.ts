import { describe, expect, it } from "vitest";
import { makeGroupToken, verifyGroupToken } from "../../api/_lib/groupToken";

const SECRET = "test-secret-not-a-real-one-0123456789abcdef";
const SLUG = "a".repeat(32);

describe("groupToken - the signed group-session cookie value", () => {
  it("round-trips a freshly minted token", () => {
    const token = makeGroupToken(SLUG, SECRET);
    const payload = verifyGroupToken(token, SECRET);
    expect(payload?.g).toBe(SLUG);
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token signed with a different secret", () => {
    const token = makeGroupToken(SLUG, SECRET);
    expect(verifyGroupToken(token, "some-other-secret")).toBeNull();
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = makeGroupToken(SLUG, SECRET);
    const [body, mac] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ g: "b".repeat(32), exp: Math.floor(Date.now() / 1000) + 1000 }),
      "utf8",
    ).toString("base64url");
    expect(verifyGroupToken(`${forgedBody}.${mac}`, SECRET)).toBeNull();
    expect(verifyGroupToken(`${body}.${mac}x`, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = makeGroupToken(SLUG, SECRET, -10);
    expect(verifyGroupToken(token, SECRET)).toBeNull();
  });

  it("rejects a slug that isn't 32 hex", () => {
    expect(verifyGroupToken(makeGroupToken("not-a-slug", SECRET), SECRET)).toBeNull();
    expect(verifyGroupToken(makeGroupToken("A".repeat(32), SECRET), SECRET)).toBeNull();
  });

  it("rejects junk, missing, and malformed input without throwing", () => {
    for (const junk of ["", "no-dot", ".", "a.", ".b", "a.b.c", undefined, null]) {
      expect(verifyGroupToken(junk as string | undefined, SECRET)).toBeNull();
    }
    expect(verifyGroupToken(makeGroupToken(SLUG, SECRET), "")).toBeNull();
  });
});
