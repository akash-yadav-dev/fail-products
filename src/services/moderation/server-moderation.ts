// src/services/moderation/server-moderation.ts
import { getDb } from "@/db";
import { CommentRepository } from "@/repositories/comment-repository";
import { ProductRepository } from "@/repositories/product-repository";
import { RateLimitRepository } from "@/repositories/rate-limit-repository";
import { ReportRepository } from "@/repositories/report-repository";
import {
  fileReport as fileReportUseCase,
  listModerationLog as listModerationLogUseCase,
  listReports as listReportsUseCase,
  moderateComment as moderateCommentUseCase,
  moderateProduct as moderateProductUseCase,
  resolveReport as resolveReportUseCase,
} from "@/services/moderation/moderation-service";
import { DatabaseRateLimiter } from "@/services/security/rate-limit";
import { findUserRole } from "@/services/user/server-profile";

/**
 * The server-side binding for the moderation use cases.
 *
 * Pages and Server Actions call these; the use cases stay free of `getDb` so
 * they run against a test database with no framework near them. Mirrors
 * `src/services/product/server-product.ts`.
 */

function dependencies() {
  const db = getDb();

  return {
    reports: new ReportRepository(db),
    comments: new CommentRepository(db),
    products: new ProductRepository(db),
    // The request-scoped reader rather than a fresh repository: every
    // moderation use case re-checks the role, and a dashboard render makes
    // three such calls for a fact that cannot change between them.
    users: { findRole: findUserRole },
    rateLimiter: new DatabaseRateLimiter(new RateLimitRepository(db)),
  };
}

type Injected =
  | "reports"
  | "comments"
  | "products"
  | "users"
  | "rateLimiter";

type Without<T> = Omit<T, Injected>;

export function fileReport(
  input: Without<Parameters<typeof fileReportUseCase>[0]>
) {
  const deps = dependencies();
  return fileReportUseCase({
    ...input,
    reports: deps.reports,
    rateLimiter: deps.rateLimiter,
  });
}

export function listReports(
  input: Without<Parameters<typeof listReportsUseCase>[0]>
) {
  const deps = dependencies();
  return listReportsUseCase({
    ...input,
    reports: deps.reports,
    users: deps.users,
  });
}

export function listModerationLog(
  input: Without<Parameters<typeof listModerationLogUseCase>[0]>
) {
  const deps = dependencies();
  return listModerationLogUseCase({
    ...input,
    reports: deps.reports,
    users: deps.users,
  });
}

export function moderateComment(
  input: Without<Parameters<typeof moderateCommentUseCase>[0]>
) {
  const deps = dependencies();
  return moderateCommentUseCase({
    ...input,
    reports: deps.reports,
    comments: deps.comments,
    users: deps.users,
  });
}

export function moderateProduct(
  input: Without<Parameters<typeof moderateProductUseCase>[0]>
) {
  const deps = dependencies();
  return moderateProductUseCase({
    ...input,
    reports: deps.reports,
    products: deps.products,
    users: deps.users,
  });
}

export function resolveReport(
  input: Without<Parameters<typeof resolveReportUseCase>[0]>
) {
  const deps = dependencies();
  return resolveReportUseCase({
    ...input,
    reports: deps.reports,
    users: deps.users,
  });
}
