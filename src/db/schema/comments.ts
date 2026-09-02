// src/db/schema/comments.ts
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { createdAt, primaryId, updatedAt } from "@/db/schema/columns";
import { products } from "@/db/schema/products";
import { users } from "@/db/schema/users";

/**
 * What moderation has done to a comment.
 *
 * A **different set** from `moderation_state` on products, and deliberately its
 * own enum rather than a reuse. `docs/MODERATION.md` §6 lists four states for a
 * comment — visible, pending, hidden, removed — and there is no FLAGGED among
 * them: a flag on a product is a public signal the page renders, while a
 * comment under suspicion is either shown or it is not. Sharing the product
 * enum would put a value in the type that no comment may ever hold.
 *
 * VISIBLE is the default because comments are not pre-moderated (ADR-012 keeps
 * listings owner-only, which is what makes that affordable). PENDING exists for
 * the case where something has to be held before it is seen, so the queue has a
 * state to put it in without inventing one under pressure.
 */
export const commentModerationStateEnum = pgEnum("comment_moderation_state", [
  "VISIBLE",
  "PENDING",
  "HIDDEN",
  "REMOVED",
]);

/**
 * Community discussion attached to a product.
 *
 * **Flat.** `docs/PRODUCT.md` §5 marks replies optional for MVP, and a thread
 * tree costs a recursive read, an ordering rule, a depth cap, and a collapse UI
 * before anyone has asked for one (`AGENTS.md` §6). Adding `parent_id` later is
 * additive; unpicking a tree nobody needed is not.
 *
 * The body is **plain text**. Not Markdown, not HTML — see
 * `src/domain/comment/rich-text.ts` for what is done with it at render, and why
 * the smaller grammar is the safer one on a site that publishes adversarial
 * content about named real businesses.
 */
export const comments = pgTable(
  "comments",
  {
    id: primaryId(),

    productId: uuid("product_id")
      .notNull()
      // Discussion about a listing has no meaning without the listing, and
      // docs/LEGAL.md §5 retains comment *text* to keep thread context — for a
      // thread that still exists.
      .references(() => products.id, { onDelete: "cascade" }),

    /**
     * Null once the account is deleted.
     *
     * docs/LEGAL.md §5: a comment is anonymised, not erased, because deleting
     * it destroys the context every reply around it depends on. The null is
     * what makes that anonymisation irreversible — nulling a display name while
     * keeping the foreign key would not be anonymisation at all.
     */
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),

    body: text("body").notNull(),

    moderationState: commentModerationStateEnum("moderation_state")
      .notNull()
      .default("VISIBLE"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // The only read this table has on a hot path: one product, oldest first.
    index("comments_product_created_idx").on(table.productId, table.createdAt),
    // "Everything this account wrote" — account deletion and abuse review.
    index("comments_author_idx").on(table.authorId),
    // The bound the service also enforces, held by the database as well.
    // A length rule that lives only in a parser is a rule an import bypasses,
    // and an unbounded text column on a public form is a storage bill.
    check(
      "comments_body_length",
      sql`char_length(${table.body}) BETWEEN 1 AND 5000`
    ),
  ]
);

export type CommentRow = typeof comments.$inferSelect;
export type NewCommentRow = typeof comments.$inferInsert;
