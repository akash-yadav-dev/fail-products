// tests/unit/domain/product/permissions.test.ts
import { describe, expect, it } from "vitest";

import {
  PRODUCT_VERBS,
  ProductAccessError,
  authorize,
  can,
  type ProductSubject,
  type Viewer,
} from "@/domain/product/permissions";

/**
 * ADR-012 — listings are owner-only. The plan requires every verb asserted, not
 * a sample, because the verb that was never tested is the one that ships open.
 */

const OWNER_ID = "01930000-0000-7000-8000-000000000001";
const OTHER_ID = "01930000-0000-7000-8000-000000000002";

const owner: Viewer = { userId: OWNER_ID };
const stranger: Viewer = { userId: OTHER_ID };
const anonymous: Viewer = { userId: null };
const moderator: Viewer = { userId: OTHER_ID, isModerator: true };

function product(overrides: Partial<ProductSubject> = {}): ProductSubject {
  return {
    ownerId: OWNER_ID,
    publicationState: "PUBLISHED",
    moderationState: "NONE",
    ...overrides,
  };
}

/** Every verb except `view` and `moderate`, which have their own rules. */
const OWNER_ONLY_VERBS = PRODUCT_VERBS.filter(
  (verb) => verb !== "view" && verb !== "moderate"
);

describe("owner-only verbs", () => {
  it.each(OWNER_ONLY_VERBS)("allows the owner to %s", (verb) => {
    expect(can(owner, verb, product())).toBe(true);
  });

  it.each(OWNER_ONLY_VERBS)("refuses a different signed-in user to %s", (verb) => {
    expect(can(stranger, verb, product())).toBe(false);
  });

  it.each(OWNER_ONLY_VERBS)("refuses an anonymous visitor to %s", (verb) => {
    expect(can(anonymous, verb, product())).toBe(false);
  });

  it.each(OWNER_ONLY_VERBS)("refuses a moderator to %s", (verb) => {
    // A moderator has the moderation axis. Editing a founder's own account of
    // what happened is not theirs to do (ADR-013).
    expect(can(moderator, verb, product())).toBe(false);
  });

  it.each(OWNER_ONLY_VERBS)(
    "refuses everyone to %s once the listing is anonymised",
    (verb) => {
      // ownerId null means the account was deleted. Ownerless is frozen, not
      // up for grabs.
      const orphan = product({ ownerId: null });
      expect(can(owner, verb, orphan)).toBe(false);
      expect(can(stranger, verb, orphan)).toBe(false);
      expect(can(anonymous, verb, orphan)).toBe(false);
    }
  );
});

describe("export_waitlist", () => {
  // The parameterised block above already covers this verb, because it derives
  // from PRODUCT_VERBS. These are stated separately anyway: this is the one
  // verb that releases *other people's* personal data, and a rule that is only
  // asserted by a `filter()` is a rule nobody reading the file will notice
  // changed.

  it("allows the owner", () => {
    expect(can(owner, "export_waitlist", product())).toBe(true);
  });

  it("refuses a moderator", () => {
    // docs/SECURITY.md §11 and docs/LEGAL.md §5: subscribers consented to hear
    // from this founder and from nobody else. Moderation is a content power,
    // not a reason to hold a list of strangers' addresses.
    expect(can(moderator, "export_waitlist", product())).toBe(false);
  });

  it("refuses a signed-out visitor", () => {
    expect(can(anonymous, "export_waitlist", product())).toBe(false);
  });

  it("stays owner-only on a listing that is not public", () => {
    // A draft or hidden listing may still hold addresses from when it was
    // public. Who may take them does not change with its publication state.
    const hidden = product({ moderationState: "HIDDEN" });
    expect(can(owner, "export_waitlist", hidden)).toBe(true);
    expect(can(stranger, "export_waitlist", hidden)).toBe(false);
  });
});

describe("moderate", () => {
  it("allows a moderator", () => {
    expect(can(moderator, "moderate", product())).toBe(true);
  });

  it("refuses the owner of the listing", () => {
    expect(can(owner, "moderate", product())).toBe(false);
  });

  it("refuses an ordinary signed-in user", () => {
    expect(can(stranger, "moderate", product())).toBe(false);
  });

  it("refuses an anonymous visitor", () => {
    expect(can(anonymous, "moderate", product())).toBe(false);
  });

  it("allows a moderator who also owns the listing", () => {
    expect(can({ userId: OWNER_ID, isModerator: true }, "moderate", product())).toBe(
      true
    );
  });
});

describe("view", () => {
  it("allows anyone to view a published, unmoderated listing", () => {
    expect(can(anonymous, "view", product())).toBe(true);
  });

  it("allows anyone to view a published listing that is merely flagged", () => {
    // docs/PRODUCT.md §6: a flag is a visible signal, not a removal.
    expect(can(anonymous, "view", product({ moderationState: "FLAGGED" }))).toBe(
      true
    );
  });

  it.each(["HIDDEN", "REMOVED"])(
    "hides a %s listing from an anonymous visitor",
    (moderationState) => {
      expect(can(anonymous, "view", product({ moderationState }))).toBe(false);
    }
  );

  it.each(["DRAFT", "PENDING_REVIEW", "ARCHIVED"])(
    "hides a %s listing from an anonymous visitor",
    (publicationState) => {
      expect(can(anonymous, "view", product({ publicationState }))).toBe(false);
    }
  );

  it("hides an unpublished listing from a different signed-in user", () => {
    expect(can(stranger, "view", product({ publicationState: "DRAFT" }))).toBe(
      false
    );
  });

  it("lets the owner view their own draft", () => {
    expect(can(owner, "view", product({ publicationState: "DRAFT" }))).toBe(true);
  });

  it("lets the owner view their own removed listing", () => {
    expect(can(owner, "view", product({ moderationState: "REMOVED" }))).toBe(true);
  });

  it("lets a moderator view anything", () => {
    expect(
      can(moderator, "view", product({ publicationState: "DRAFT", moderationState: "REMOVED" }))
    ).toBe(true);
  });
});

describe("authorize", () => {
  it("returns nothing when the verb is permitted", () => {
    expect(authorize(owner, "edit", product())).toBeUndefined();
  });

  it("throws when it is not", () => {
    expect(() => authorize(stranger, "edit", product())).toThrow(ProductAccessError);
  });

  it("does not reveal that the record exists", () => {
    // An authorization message that differs from a 404 message tells an
    // attacker which ids are real (docs/SECURITY.md).
    expect(() => authorize(stranger, "edit", product())).toThrow("Not found");
  });

  it("carries the verb for logging without putting it in the message", () => {
    try {
      authorize(stranger, "publish", product());
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProductAccessError);
      expect((error as ProductAccessError).verb).toBe("publish");
      expect((error as ProductAccessError).message).not.toContain("publish");
    }
  });
});
