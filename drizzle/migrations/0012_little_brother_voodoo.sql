DROP INDEX "reports_reporter_product_key";--> statement-breakpoint
DROP INDEX "reports_reporter_comment_key";--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_product_key" ON "reports" USING btree ("reporter_id","product_id") WHERE "reports"."product_id" IS NOT NULL AND "reports"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_comment_key" ON "reports" USING btree ("reporter_id","comment_id") WHERE "reports"."comment_id" IS NOT NULL AND "reports"."status" = 'OPEN';