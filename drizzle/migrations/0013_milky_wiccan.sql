CREATE TYPE "public"."waitlist_entry_status" AS ENUM('PENDING', 'CONFIRMED');--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"status" "waitlist_entry_status" DEFAULT 'PENDING' NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_statement" varchar(400) NOT NULL,
	"confirmation_token_hash" varchar(64),
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_confirmation_complete" CHECK (("waitlist_entries"."status" = 'PENDING' AND "waitlist_entries"."confirmed_at" IS NULL AND "waitlist_entries"."confirmation_token_hash" IS NOT NULL)
       OR ("waitlist_entries"."status" = 'CONFIRMED' AND "waitlist_entries"."confirmed_at" IS NOT NULL AND "waitlist_entries"."confirmation_token_hash" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "waitlist_exports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"actor_id" uuid,
	"row_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "waitlist_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_exports" ADD CONSTRAINT "waitlist_exports_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_exports" ADD CONSTRAINT "waitlist_exports_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_entries_product_email_key" ON "waitlist_entries" USING btree ("product_id","email");--> statement-breakpoint
CREATE INDEX "waitlist_entries_product_status_idx" ON "waitlist_entries" USING btree ("product_id","status","created_at");--> statement-breakpoint
CREATE INDEX "waitlist_entries_token_idx" ON "waitlist_entries" USING btree ("confirmation_token_hash");--> statement-breakpoint
CREATE INDEX "waitlist_exports_product_idx" ON "waitlist_exports" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "waitlist_exports_actor_idx" ON "waitlist_exports" USING btree ("actor_id");