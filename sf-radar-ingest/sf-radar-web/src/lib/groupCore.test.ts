import { describe, expect, it } from "vitest";
import {
  joinErrorToHttp,
  validateCreate,
  validateJoin,
  validateLogin,
  validateSettings,
} from "../../api/_lib/groupCore";
import { cleanText } from "../../api/_lib/groupText";
import {
  FEED_TOKEN_RE,
  GROUP_SLUG_RE,
  randomFeedToken,
  randomGroupSlug,
} from "../../api/_lib/groupIds";

const PLAN_SLUG = "a".repeat(20);
const EDIT_KEY = "b".repeat(48);
const GROUP_SLUG = "c".repeat(32);

const CREATE_OK = {
  planSlug: PLAN_SLUG,
  editKey: EDIT_KEY,
  name: "Sept SF crew",
  startDate: "2026-09-14",
  endDate: "2026-09-27",
  passphrase: "  Blue Fox River  ",
  displayName: "Alekos",
};

describe("cleanText - mirror of SQL clean_text()", () => {
  it("strips CR/LF and other control chars, collapses whitespace, trims", () => {
    expect(cleanText("Sarah\r\nBEGIN:VEVENT")).toBe("Sarah BEGIN:VEVENT");
    expect(cleanText("  a\t\t b   c ")).toBe("a b c");
  });
  it("empty / whitespace-only / non-string becomes null", () => {
    expect(cleanText("   ")).toBeNull();
    expect(cleanText("")).toBeNull();
    expect(cleanText(42)).toBeNull();
    expect(cleanText(undefined)).toBeNull();
  });
});

describe("randomGroupSlug / randomFeedToken - shaped for the migration 003 CHECKs", () => {
  it("group slug is 32 lowercase hex", () => {
    for (let i = 0; i < 50; i++) expect(randomGroupSlug()).toMatch(GROUP_SLUG_RE);
  });
  it("feed token is 32 chars of [A-Za-z0-9_-]", () => {
    for (let i = 0; i < 50; i++) expect(randomFeedToken()).toMatch(FEED_TOKEN_RE);
  });
  it("values don't repeat across calls", () => {
    const s = new Set(Array.from({ length: 200 }, () => randomGroupSlug()));
    expect(s.size).toBe(200);
  });
});

describe("validateCreate", () => {
  it("accepts a well-formed body and normalizes the passphrase + names", () => {
    const r = validateCreate(CREATE_OK);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.normalizedPassphrase).toBe("blue fox river");
    expect(r.value.name).toBe("Sept SF crew");
    expect(r.value.displayName).toBe("Alekos");
  });

  it("strips CR/LF from the group name and the display name", () => {
    const r = validateCreate({ ...CREATE_OK, name: "crew\r\nSUMMARY:x", displayName: "A\nB" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("crew SUMMARY:x");
    expect(r.value.displayName).toBe("A B");
  });

  it("rejects a bad plan slug / edit key", () => {
    expect(validateCreate({ ...CREATE_OK, planSlug: "short" }).ok).toBe(false);
    expect(validateCreate({ ...CREATE_OK, editKey: "NOT-HEX" }).ok).toBe(false);
  });

  it("rejects an empty or over-long group name", () => {
    expect(validateCreate({ ...CREATE_OK, name: "   " }).ok).toBe(false);
    expect(validateCreate({ ...CREATE_OK, name: "x".repeat(81) }).ok).toBe(false);
  });

  it("rejects non-real dates and end-before-start", () => {
    expect(validateCreate({ ...CREATE_OK, startDate: "2026-02-30" }).ok).toBe(false);
    expect(validateCreate({ ...CREATE_OK, startDate: "2026-9-1" }).ok).toBe(false);
    expect(validateCreate({ ...CREATE_OK, endDate: "2026-09-13" }).ok).toBe(false);
  });

  it("rejects a too-short passphrase (after trim)", () => {
    const r = validateCreate({ ...CREATE_OK, passphrase: "  ab  " });
    expect(r.ok).toBe(false);
  });

  it("rejects an over-long display name", () => {
    expect(validateCreate({ ...CREATE_OK, displayName: "x".repeat(41) }).ok).toBe(false);
  });
});

describe("validateLogin", () => {
  it("accepts a valid slug + passphrase, normalizes the passphrase", () => {
    const r = validateLogin({ groupSlug: GROUP_SLUG, passphrase: "  Blue Fox  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.normalizedPassphrase).toBe("blue fox");
  });
  it("does NOT enforce passphrase length (wrong length == wrong passphrase)", () => {
    expect(validateLogin({ groupSlug: GROUP_SLUG, passphrase: "ab" }).ok).toBe(true);
  });
  it("rejects a malformed group slug and a missing passphrase", () => {
    expect(validateLogin({ groupSlug: "nope", passphrase: "whatever" }).ok).toBe(false);
    expect(validateLogin({ groupSlug: GROUP_SLUG, passphrase: "   " }).ok).toBe(false);
  });
});

describe("validateJoin", () => {
  it("accepts plan slug + edit key + name", () => {
    const r = validateJoin({ planSlug: PLAN_SLUG, editKey: EDIT_KEY, displayName: "Mara" });
    expect(r.ok).toBe(true);
  });
  it("rejects bad slug / key / name", () => {
    expect(validateJoin({ planSlug: "x", editKey: EDIT_KEY, displayName: "Mara" }).ok).toBe(false);
    expect(validateJoin({ planSlug: PLAN_SLUG, editKey: "x", displayName: "Mara" }).ok).toBe(false);
    expect(validateJoin({ planSlug: PLAN_SLUG, editKey: EDIT_KEY, displayName: "" }).ok).toBe(false);
  });
});

describe("validateSettings", () => {
  it("accepts a rename-only body, cleaning the name", () => {
    const r = validateSettings({ name: "  New\r\nName  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("New Name");
      expect(r.value.changePassphrase).toBe(false);
    }
  });
  it("accepts a passphrase-change body, normalizing both", () => {
    const r = validateSettings({ currentPassphrase: "  Old Pass ", newPassphrase: " New PASS " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.changePassphrase).toBe(true);
      expect(r.value.currentPassphrase).toBe("old pass");
      expect(r.value.newPassphrase).toBe("new pass");
      expect(r.value.name).toBeNull();
    }
  });
  it("rejects an empty body (nothing to change)", () => {
    expect(validateSettings({}).ok).toBe(false);
  });
  it("rejects a too-long name", () => {
    expect(validateSettings({ name: "x".repeat(81) }).ok).toBe(false);
  });
  it("rejects a name that cleans to empty", () => {
    expect(validateSettings({ name: "  \r\n  " }).ok).toBe(false);
  });
  it("enforces new-passphrase length but not current-passphrase length", () => {
    expect(validateSettings({ currentPassphrase: "ok", newPassphrase: "ab" }).ok).toBe(false);
    const r = validateSettings({ currentPassphrase: "x", newPassphrase: "abcd" });
    expect(r.ok).toBe(true);
  });
  it("requires the current passphrase when changing it", () => {
    expect(validateSettings({ newPassphrase: "abcd" }).ok).toBe(false);
    expect(validateSettings({ currentPassphrase: "   ", newPassphrase: "abcd" }).ok).toBe(false);
  });
  it("rejects a no-op passphrase change (new equals current after normalizing)", () => {
    expect(validateSettings({ currentPassphrase: "Same One", newPassphrase: " same one " }).ok).toBe(
      false,
    );
  });
});

describe("joinErrorToHttp - maps join_group's RAISE messages", () => {
  it("maps known Postgres errors to sensible statuses", () => {
    expect(joinErrorToHttp("already a member").status).toBe(409);
    expect(joinErrorToHttp("group is full (16 max)").status).toBe(409);
    expect(joinErrorToHttp("rate limit exceeded").status).toBe(429);
    expect(joinErrorToHttp("no such group").status).toBe(404);
    expect(joinErrorToHttp("plan does not exist").status).toBe(400);
  });
  it("falls back to 502 for anything unrecognised", () => {
    expect(joinErrorToHttp(undefined).status).toBe(502);
    expect(joinErrorToHttp("some novel db failure").status).toBe(502);
  });
});
