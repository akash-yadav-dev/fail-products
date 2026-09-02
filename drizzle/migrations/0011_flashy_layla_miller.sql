CREATE TYPE "public"."report_reason" AS ENUM('SPAM', 'HARASSMENT', 'IMPERSONATION', 'PRIVACY', 'SCAM_OR_MALWARE', 'COPYRIGHT', 'INCORRECT_INFORMATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'ACTIONED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."report_target_type" AS ENUM('PRODUCT', 'COMMENT');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('MEMBER', 'MODERATOR');--> statement-breakpoint
CREATE TABLE "comment_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"comment_id" uuid NOT NULL,
	"from_value" "comment_moderation_state" NOT NULL,
	"to_value" "comment_moderation_state" NOT NULL,
	"actor_id" uuid,
	"report_id" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_type" "report_target_type" NOT NULL,
	"product_id" uuid,
	"comment_id" uuid,
	"reporter_id" uuid,
	"reason" "report_reason" NOT NULL,
	"detail" varchar(1000),
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_one_target" CHECK (("reports"."target_type" = 'PRODUCT' AND "reports"."product_id" IS NOT NULL AND "reports"."comment_id" IS NULL)
       OR ("reports"."target_type" = 'COMMENT' AND "reports"."comment_id" IS NOT NULL AND "reports"."product_id" IS NULL)),
	CONSTRAINT "reports_resolution_complete" CHECK (("reports"."status" = 'OPEN' AND "reports"."resolved_at" IS NULL)
       OR ("reports"."status" <> 'OPEN' AND "reports"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'MEMBER' NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_status_history" ADD CONSTRAINT "comment_status_history_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_status_history" ADD CONSTRAINT "comment_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_status_history" ADD CONSTRAINT "comment_status_history_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_status_history_comment_idx" ON "comment_status_history" USING btree ("comment_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_status_history_actor_idx" ON "comment_status_history" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_product_idx" ON "reports" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "reports_comment_idx" ON "reports" USING btree ("comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_product_key" ON "reports" USING btree ("reporter_id","product_id") WHERE "reports"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_comment_key" ON "reports" USING btree ("reporter_id","comment_id") WHERE "reports"."comment_id" IS NOT NULL;