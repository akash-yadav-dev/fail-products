// src/db/schema/index.ts
/**
 * The schema drizzle-kit reads and `src/db/index.ts` passes to the client.
 *
 * This is a schema manifest, not a convenience barrel — drizzle needs one
 * module holding every table for migration generation and for relational
 * queries. Application code imports the specific table module it needs.
 */
export * from "@/db/schema/enums";
export * from "@/db/schema/products";
export * from "@/db/schema/taxonomy";
export * from "@/db/schema/users";
