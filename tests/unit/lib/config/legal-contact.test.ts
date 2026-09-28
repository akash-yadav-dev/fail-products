import { afterEach, describe, expect, it, vi } from "vitest";

import { legalContactEmail } from "@/lib/config/legal-contact";

afterEach(() => vi.unstubAllEnvs());

describe("public legal contact", () => {
  it("exposes a configured project mailbox", () => {
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "  LEGAL@Example.test  ");
    expect(legalContactEmail()).toBe("legal@example.test");
  });

  it("does not expose an invalid mail link", () => {
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "legal@example.test?subject=unexpected");
    expect(legalContactEmail()).toBeNull();
  });

  it("keeps the contact state explicit when no mailbox is configured", () => {
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "");
    expect(legalContactEmail()).toBeNull();
  });
});
