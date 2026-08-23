ALTER TABLE "domains" ADD COLUMN "verification_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "dns_checks" jsonb;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_verification_token_unique" ON "domains" USING btree ("verification_token");--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_status_check" CHECK ("domains"."status" in ('pending', 'verified'));