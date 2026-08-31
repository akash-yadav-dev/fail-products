import { expect, test } from "@playwright/test";

test("redirects signed-out visitors away from the dashboard", async ({ page, context }) => {
  await page.goto("/api/auth/test-session");
  await context.clearCookies();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
});

test("the sign-in form offers OTP and GitHub paths", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: /email me a sign-in code/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /continue with github/i })).toHaveAttribute(
    "href",
    "/api/auth/github"
  );
});
