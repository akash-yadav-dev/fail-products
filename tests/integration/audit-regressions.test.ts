import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { authTokens, comments, products, productStatusHistory, reports, users } from "@/db/schema";
import { AuthRepository } from "@/repositories/auth-repository";
import { ProductRepository } from "@/repositories/product-repository";
import { ReportRepository } from "@/repositories/report-repository";
import { RateLimitRepository } from "@/repositories/rate-limit-repository";
import { requestEmailCode, verifyEmailCode, signInWithGithub, getSessionUser, revokeSession } from "@/services/auth/auth-service";
import { createProduct } from "@/services/product/server-product";
import { updateProfile } from "@/services/user/server-profile";
import { DatabaseRateLimiter, RATE_LIMITS } from "@/services/security/rate-limit";
import { noDatabase, testDb, unique } from "./database";
import { uuidv7 } from "@/lib/ids/uuid-v7";

describe.skipIf(noDatabase)("security audit regressions", () => {
  const db = noDatabase ? null : testDb();
  const userIds: string[] = [];
  const productIds: string[] = [];
  const emails: string[] = [];
  const limitSubjects: string[] = [];
  const auth = () => new AuthRepository(db!);
  const limiter = () => new DatabaseRateLimiter(new RateLimitRepository(db!));

  async function account() {
    const email = `${unique("audit")}@example.test`;
    emails.push(email);
    const [row] = await db!.insert(users).values({ email }).returning({ id: users.id });
    userIds.push(row!.id);
    return { id: row!.id, email };
  }

  async function listing(ownerId: string, name = unique("audit-product")) {
    const created = await new ProductRepository(db!).createAtSlug({ ownerId, name, slug: name, tagline: null, description: "x".repeat(20_000), websiteUrl: null, failureStatus: "ABANDONED" });
    productIds.push(created!.id);
    return created!;
  }

  afterAll(async () => {
    if (!db) return;
    if (productIds.length) await db.delete(products).where(inArray(products.id, productIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (emails.length) await db.delete(authTokens).where(inArray(authTokens.email, emails));
    for (const subject of limitSubjects) for (const rule of Object.values(RATE_LIMITS)) await limiter().reset(rule, subject);
  });

  it("allows the same six-digit code for different email addresses", async () => {
    const a = await account();
    const b = await account();
    for (const user of [a, b]) {
      await expect(requestEmailCode({ repository: auth(), email: user.email, ipAddress: user.id, generateCode: () => "314159", sendOtp: async () => {} })).resolves.toEqual({ ok: true });
    }
    for (const user of [a, b]) {
      const result = await verifyEmailCode({ repository: auth(), email: user.email, ipAddress: user.id, code: "314159" });
      expect(result).toMatchObject({ ok: true, userId: user.id });
    }
  });

  it("locks older active codes as well as the newest after five wrong guesses", async () => {
    const user = await account();
    const now = Date.now();
    for (const code of ["111111", "222222"]) await requestEmailCode({ repository: auth(), email: user.email, ipAddress: user.id, now, generateCode: () => code, sendOtp: async () => {} });
    for (let i = 0; i < 5; i++) await verifyEmailCode({ repository: auth(), email: user.email, ipAddress: user.id, now, code: "999999" });
    const rows = await db!.select({ attempts: authTokens.attempts }).from(authTokens).where(eq(authTokens.email, user.email));
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.attempts === 5)).toBe(true);
    for (const code of ["111111", "222222"]) expect((await verifyEmailCode({ repository: auth(), email: user.email, ipAddress: user.id, now, code })).ok).toBe(false);
  });

  it("signs in a GitHub identity without email and reuses the linked account", async () => {
    const profile = { id: unique("github"), email: null, displayName: "Builder" };
    const first = await signInWithGithub({ repository: auth(), profile });
    if (first) userIds.push(first.userId);
    expect(first).not.toBeNull();
    const second = await signInWithGithub({ repository: auth(), profile });
    expect(second?.userId).toBe(first?.userId);
    expect(await getSessionUser(auth(), first!.sessionToken)).toMatchObject({ userId: first!.userId });
    await revokeSession(auth(), first!.sessionToken);
    expect(await getSessionUser(auth(), first!.sessionToken)).toBeNull();
  });

  it("blocks a submission at the configured limit without writing a draft", async () => {
    const user = await account();
    limitSubjects.push(user.id);
    for (let i = 0; i < RATE_LIMITS.productSubmit.limit; i++) await limiter().consume(RATE_LIMITS.productSubmit, user.id);
    await expect(createProduct({ ownerId: user.id, name: unique("blocked"), failureStatus: "ABANDONED" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await db!.select().from(products).where(eq(products.ownerId, user.id))).toHaveLength(0);
  });

  it("blocks profile writes at the limit while another account still has its allowance", async () => {
    const a = await account();
    const b = await account();
    limitSubjects.push(a.id, b.id);
    for (let i = 0; i < RATE_LIMITS.profileUpdate.limit; i++) await limiter().consume(RATE_LIMITS.profileUpdate, a.id);
    await expect(updateProfile({ userId: a.id, displayName: "Blocked" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(updateProfile({ userId: b.id, displayName: "Allowed" })).resolves.toMatchObject({ changed: true });
    expect((await db!.select().from(users).where(eq(users.id, a.id)))[0]?.displayName).toBeNull();
  });

  it("does not return full descriptions in directory cards", async () => {
    const user = await account();
    const item = await listing(user.id);
    await db!.update(products).set({ publicationState: "PUBLISHED", publishedAt: new Date() }).where(eq(products.id, item.id));
    const rows = await new ProductRepository(db!).listPublic({ limit: 48, sort: "newest" });
    const card = rows.find(row => row.id === item.id);
    expect(card).toBeDefined();
    expect(card).not.toHaveProperty("description");
  });

  it("rolls back a moderation state change when its audit insert fails", async () => {
    const user = await account();
    const item = await listing(user.id);
    const [comment] = await db!.insert(comments).values({ productId: item.id, authorId: user.id, body: "A comment" }).returning();
    await expect(new ReportRepository(db!).applyCommentModeration({ commentId: comment!.id, from: "VISIBLE", to: "HIDDEN", actorId: user.id, reportId: uuidv7(), reason: "Audit fixture", now: new Date() })).rejects.toThrow();
    expect((await db!.select().from(comments).where(eq(comments.id, comment!.id)))[0]?.moderationState).toBe("VISIBLE");
  });

  it("refuses to confirm an unpublished draft exists, but keeps a takedown reportable", async () => {
    // The two halves of the same predicate, which are easy to conflate and
    // wrong in opposite directions. A draft was never public: answering for it
    // turns the report form into an existence oracle for other people's
    // unpublished work. A hidden listing was public: refusing to answer for it
    // removes the appeal path `docs/MODERATION.md` §10 promises, because an
    // appeal against a takedown is always filed after the takedown.
    const user = await account();
    const repository = new ReportRepository(db!);

    const draft = await listing(user.id);
    expect(await repository.findReportableProduct(draft.id)).toBeNull();

    const draftComment = await db!.insert(comments)
      .values({ productId: draft.id, authorId: user.id, body: "On a draft" }).returning();
    expect(await repository.findReportableComment(draftComment[0]!.id)).toBeNull();

    await db!.update(products)
      .set({ publicationState: "PUBLISHED", publishedAt: new Date(), moderationState: "HIDDEN" })
      .where(eq(products.id, draft.id));

    expect(await repository.findReportableProduct(draft.id)).toMatchObject({ id: draft.id });
    expect(await repository.findReportableComment(draftComment[0]!.id))
      .toMatchObject({ id: draftComment[0]!.id });
  });

  it("allows only one competing moderation transition and records it once", async () => {
    const user = await account();
    const item = await listing(user.id);
    const repository = new ReportRepository(db!);
    const input = { productId: item.id, from: "NONE" as const, actorId: user.id, reason: "Audit fixture", now: new Date() };
    const result = await Promise.all([repository.applyProductModeration({ ...input, to: "HIDDEN" }), repository.applyProductModeration({ ...input, to: "REMOVED" })]);
    expect(result.filter(Boolean)).toHaveLength(1);
    expect(await db!.select().from(productStatusHistory).where(and(eq(productStatusHistory.productId, item.id), eq(productStatusHistory.axis, "MODERATION")))).toHaveLength(1);
    expect(await db!.select().from(reports).where(eq(reports.productId, item.id))).toHaveLength(0);
  });
});
