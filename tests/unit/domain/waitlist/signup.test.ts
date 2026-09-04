import { describe, expect, it } from "vitest";

import {
  WAITLIST_CONSENT_STATEMENT,
  WAITLIST_ENTRY_STATUSES,
  hasWaitlistConsent,
  parseWaitlistSignup,
} from "@/domain/waitlist/signup";

/**
 * Waitlist signup rules (Phase 4 slice 4.1).
 *
 * Two rules decide whether an address may be stored, and the second one is the
 * one that matters legally: `docs/LEGAL.md` §5 files a waitlist entry as
 * consent-based, so an entry with no consent record is an address the site has
 * no basis to write to. Every rejection branch is asserted, because the
 * rejections *are* the rule.
 */

describe("hasWaitlistConsent", () => {
  it("accepts the value a ticked checkbox posts", () => {
    expect(hasWaitlistConsent("on")).toBe(true);
  });

  it("accepts an explicit true, for a caller that is not an HTML form", () => {
    expect(hasWaitlistConsent("true")).toBe(true);
    expect(hasWaitlistConsent(true)).toBe(true);
  });

  it("refuses an absent field, which is what an unticked checkbox sends", () => {
    // An unchecked checkbox is not submitted at all. This is the branch that
    // decides whether "I did not tick it" is read as consent.
    expect(hasWaitlistConsent(undefined)).toBe(false);
    expect(hasWaitlistConsent(null)).toBe(false);
  });

  it('refuses the string "false", which a truthiness test would accept', () => {
    // The specific bug an allowlist exists to prevent: `Boolean("false")` is
    // true, so a script posting consent=false would be recorded as consenting.
    expect(hasWaitlistConsent("false")).toBe(false);
  });

  it("refuses any other value a form could carry", () => {
    expect(hasWaitlistConsent("0")).toBe(false);
    expect(hasWaitlistConsent("yes")).toBe(false);
    expect(hasWaitlistConsent(1)).toBe(false);
    expect(hasWaitlistConsent({})).toBe(false);
  });
});

describe("parseWaitlistSignup", () => {
  it("accepts an address with consent, and normalises the address", () => {
    const result = parseWaitlistSignup({
      email: "  Reader@Example.test ",
      consent: "on",
    });

    expect(result).toEqual({
      ok: true,
      signup: {
        email: "reader@example.test",
        consentStatement: WAITLIST_CONSENT_STATEMENT,
      },
    });
  });

  it("records the consent wording verbatim rather than a version pointer", () => {
    // Consent is only evidence if you can show what was agreed to. A pointer
    // into a document that has since been edited shows nothing.
    const result = parseWaitlistSignup({
      email: "reader@example.test",
      consent: "on",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signup.consentStatement).toBe(WAITLIST_CONSENT_STATEMENT);
    expect(result.signup.consentStatement.length).toBeGreaterThan(0);
  });

  it("rejects an address that is not one", () => {
    expect(
      parseWaitlistSignup({ email: "not-an-email", consent: "on" })
    ).toEqual({ ok: false, reason: "INVALID_EMAIL" });
  });

  it("rejects a signup with no consent, however valid the address", () => {
    expect(
      parseWaitlistSignup({ email: "reader@example.test", consent: undefined })
    ).toEqual({ ok: false, reason: "CONSENT_REQUIRED" });
  });

  it("reports the bad address first when both are wrong", () => {
    // Somebody who mistyped their address is told that, rather than being told
    // about the box they did tick and then told again about the typo.
    expect(
      parseWaitlistSignup({ email: "nope", consent: undefined })
    ).toEqual({ ok: false, reason: "INVALID_EMAIL" });
  });
});

describe("the waitlist entry states", () => {
  it("has no unsubscribed state", () => {
    // docs/LEGAL.md §5: an entry is *erased* on request, not flagged. A row
    // marked unsubscribed is personal data that has not been deleted, and
    // leaving the state out is what stops that being implemented later by
    // someone reaching for the cheaper option.
    expect(WAITLIST_ENTRY_STATUSES).toEqual(["PENDING", "CONFIRMED"]);
  });
});
