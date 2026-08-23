ALTER TABLE "domains" ADD COLUMN "outbound_provider" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "outbound_provider" text DEFAULT 'test-sink' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "outbound_provider" text DEFAULT 'smtp' NOT NULL;--> statement-breakpoint
UPDATE "messages" SET "outbound_provider" = 'smtp' WHERE "delivery_mode" = 'live';--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_outbound_provider_check" CHECK ("domains"."outbound_provider" is null or "domains"."outbound_provider" in ('smtp', 'cloudflare-email', 'aws-ses', 'azure-email'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_outbound_provider_check" CHECK ("messages"."outbound_provider" in ('smtp', 'cloudflare-email', 'aws-ses', 'azure-email', 'test-sink'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_provider_mode_check" CHECK (("messages"."delivery_mode" = 'test-sink' and "messages"."outbound_provider" = 'test-sink') or ("messages"."delivery_mode" = 'live' and "messages"."outbound_provider" <> 'test-sink'));--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_outbound_provider_check" CHECK ("orgs"."outbound_provider" in ('smtp', 'cloudflare-email', 'aws-ses', 'azure-email'));
