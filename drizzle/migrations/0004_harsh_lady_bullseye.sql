CREATE TYPE "public"."actor_role" AS ENUM('OWNER', 'MODERATOR', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."status_axis" AS ENUM('PUBLICATION', 'MODERATION', 'FAILURE');--> statement-breakpoint
CREATE TABLE "product_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"axis" "status_axis" NOT NULL,
	"from_value" varchar(32),
	"to_value" varchar(32) NOT NULL,
	"actor_id" uuid,
	"actor_role" "actor_role" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_status_history" ADD CONSTRAINT "product_status_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_status_history" ADD CONSTRAINT "product_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_status_history_product_idx" ON "product_status_history" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "product_status_history_actor_idx" ON "product_status_history" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "auth_tokens_email_created_idx" ON "auth_tokens" USING btree ("email","created_at");