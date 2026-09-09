import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { removeSeededAccount, seedSignedInAccount } from "./fixtures/seed-session";

test("a forged identity or moderator field cannot change another account", async ({ page, context, baseURL }) => {
  test.skip(!process.env.DATABASE_URL, "Needs an isolated Neon development branch");
  const owner = await seedSignedInAccount();
  const other = await seedSignedInAccount();
  const db = drizzle(neon(process.env.DATABASE_URL!));
  try {
    await context.addCookies([{
      name: "__Host-failproducts_session", value: other.token,
      domain: new URL(baseURL!).hostname, path: "/", secure: true, httpOnly: true, sameSite: "Lax",
    }]);
    await page.goto("/dashboard/settings");
    await page.getByLabel("Display name").fill("Changed by current account");
    await page.evaluate((ownerId) => {
      const form = document.querySelector('input[name="displayName"]')!.closest("form")!;
      for (const [name, value] of Object.entries({ userId: ownerId, ownerId, role: "MODERATOR", isModerator: "true" })) {
        const input = document.createElement("input");
        input.type = "hidden"; input.name = name; input.value = value; form.append(input);
      }
    }, owner.userId);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("Profile saved.");
    const [unchanged] = await db.select().from(users).where(eq(users.id, owner.userId));
    const [changed] = await db.select().from(users).where(eq(users.id, other.userId));
    expect(unchanged?.displayName).toBe(`Test ${owner.username}`);
    expect(changed?.displayName).toBe("Changed by current account");
    expect(changed?.role).toBe("MEMBER");
    const denied = await page.goto("/dashboard/moderation");
    expect(denied?.status()).toBe(404);
  } finally {
    await removeSeededAccount(owner.userId);
    await removeSeededAccount(other.userId);
  }
});

test("cross-origin Server Action posts are rejected before mutation", async ({ page, request, baseURL }) => {
  await page.goto("/auth/sign-in");
  await page.route("**/auth/sign-in", async route => {
    if (route.request().method() === "POST") await route.abort();
    else await route.continue();
  });
  await page.getByLabel("Email address").fill("csrf-fixture@example.test");
  const pending = page.waitForRequest(req => req.method() === "POST" && req.url().endsWith("/auth/sign-in"));
  await page.getByRole("button", { name: /email me a sign-in code/i }).click();
  const captured = await pending;
  const headers = captured.headers();
  expect(headers["next-action"]).toBeTruthy();
  const result = await request.post("/auth/sign-in", {
    headers: { origin: "https://attacker.example", "next-action": headers["next-action"]!, "content-type": headers["content-type"]! },
    data: captured.postDataBuffer()!,
  });
  expect(result.status()).toBeGreaterThanOrEqual(400);
  expect(new URL(result.url()).origin).toBe(new URL(baseURL!).origin);
});
