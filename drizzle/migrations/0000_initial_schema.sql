CREATE TYPE "public"."failure_status" AS ENUM('STRUGGLING', 'LOW_TRACTION', 'ABANDONED', 'SHUT_DOWN', 'RECOVERING');--> statement-breakpoint
CREATE TYPE "public"."moderation_state" AS ENUM('NONE', 'FLAGGED', 'HIDDEN', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."publication_state" AS ENUM('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "product_slug_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"slug" varchar(96) NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_tags" (
	"product_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "product_tags_product_id_tag_id_pk" PRIMARY KEY("product_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" varchar(120) NOT NULL,
	"tagline" varchar(200),
	"description" text,
	"website_url" text,
	"logo_key" text,
	"category_id" uuid,
	"failure_status" "failure_status" NOT NULL,
	"publication_state" "publication_state" DEFAULT 'DRAFT' NOT NULL,
	"moderation_state" "moderation_state" DEFAULT 'NONE' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(39) NOT NULL,
	"username_lower" varchar(39) NOT NULL,
	"email" varchar(320),
	"display_name" varchar(80),
	"bio" text,
	"website_url" text,
	"avatar_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_slug_history" ADD CONSTRAINT "product_slug_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_slug_history_slug_key" ON "product_slug_history" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_slug_history_product_id_idx" ON "product_slug_history" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_tags_tag_id_idx" ON "product_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_key" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_owner_id_idx" ON "products" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_public_listing_idx" ON "products" USING btree ("publication_state","moderation_state","published_at");--> statement-breakpoint
CREATE INDEX "products_failure_status_idx" ON "products" USING btree ("failure_status");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_key" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_key" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_slug_key" ON "tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" USING btree ("username_lower");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");