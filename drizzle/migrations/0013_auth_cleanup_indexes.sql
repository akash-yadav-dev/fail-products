CREATE INDEX "auth_tokens_expiry_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_tokens_consumed_idx" ON "auth_tokens" USING btree ("id") WHERE "auth_tokens"."consumed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_revoked_idx" ON "sessions" USING btree ("id") WHERE "sessions"."revoked_at" IS NOT NULL;