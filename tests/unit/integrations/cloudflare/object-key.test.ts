// tests/unit/integrations/cloudflare/object-key.test.ts
import { describe, expect, it } from "vitest";

import { createObjectKey } from "@/integrations/cloudflare/object-key";
import { uuidv7 } from "@/lib/ids/uuid-v7";

/**
 * docs/SECURITY.md §7: keys are generated server-side from a CSPRNG, and a user
 * filename is never interpolated into one. The tests below are mostly about
 * what must *not* end up in a key.
 */

const OWNER = uuidv7();

describe("createObjectKey", () => {
  it("scopes the key by purpose and owner", () => {
    expect(createObjectKey("product-logo", OWNER, "image/webp")).toMatch(
      new RegExp(`^product-logo/${OWNER}/[0-9a-f]{32}\\.webp$`)
    );
  });

  it("uses the avatar scope for avatars", () => {
    expect(createObjectKey("user-avatar", OWNER, "image/png")).toMatch(
      new RegExp(`^user-avatar/${OWNER}/[0-9a-f]{32}\\.png$`)
    );
  });

  it("takes the extension from the detected type, not from any filename", () => {
    // The caller passes what magic-byte detection returned; there is no
    // parameter through which a filename could reach the key.
    expect(createObjectKey("product-logo", OWNER, "image/jpeg")).toMatch(
      /\.jpg$/
    );
    expect(createObjectKey("product-logo", OWNER, "image/avif")).toMatch(
      /\.avif$/
    );
    expect(createObjectKey("product-logo", OWNER, "image/gif")).toMatch(
      /\.gif$/
    );
  });

  it("never repeats a key", () => {
    const keys = new Set(
      Array.from({ length: 500 }, () =>
        createObjectKey("product-logo", OWNER, "image/png")
      )
    );

    expect(keys.size).toBe(500);
  });

  it("produces only characters that are safe in a key and a URL", () => {
    const key = createObjectKey("product-logo", OWNER, "image/png");

    expect(key).toMatch(/^[a-z0-9/.-]+$/);
    expect(key).not.toContain("..");
  });

  it("rejects an owner id that is not a UUID", () => {
    // A non-UUID here means the caller passed something user-controlled, which
    // is the traversal this function exists to prevent.
    expect(() =>
      createObjectKey("product-logo", "../../etc/passwd", "image/png")
    ).toThrowError(/UUID owner id/);
  });

  it("rejects an empty owner id", () => {
    expect(() => createObjectKey("product-logo", "", "image/png")).toThrowError(
      /UUID owner id/
    );
  });

  it("rejects an owner id with a path separator appended", () => {
    expect(() =>
      createObjectKey("product-logo", `${OWNER}/../other`, "image/png")
    ).toThrowError(/UUID owner id/);
  });
});
