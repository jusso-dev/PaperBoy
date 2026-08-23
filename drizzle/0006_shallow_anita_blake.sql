ALTER TABLE "messages" ADD COLUMN "from" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "to" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "html" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "text" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "environment" text DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivery_mode" text DEFAULT 'test-sink' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "request_hash" text;--> statement-breakpoint
-- The send endpoint was a 501 before this migration. Preserve any manually
-- inserted legacy rows as failed, test-sink records rather than making them
-- deliverable with invented content.
UPDATE "messages"
SET
	"from" = 'legacy@invalid',
	"to" = '[]'::jsonb,
	"subject" = 'Legacy message',
	"text" = 'No message content was stored before the send API migration.',
	"status" = 'failed';--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "from" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "to" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "subject" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_api_key_id_idempotency_key_unique" ON "messages" USING btree ("api_key_id","idempotency_key") WHERE "messages"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "messages_status_created_at_idx" ON "messages" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_status_check" CHECK ("messages"."status" in ('queued', 'sending', 'sent', 'failed'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_environment_check" CHECK ("messages"."environment" in ('live', 'test'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_delivery_mode_check" CHECK ("messages"."delivery_mode" in ('live', 'test-sink'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_to_array_check" CHECK (jsonb_typeof("messages"."to") = 'array');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tags_array_check" CHECK (jsonb_typeof("messages"."tags") = 'array');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_check" CHECK ("messages"."html" is not null or "messages"."text" is not null);--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_idempotency_state_check" CHECK (("messages"."idempotency_key" is null and "messages"."request_hash" is null) or ("messages"."idempotency_key" is not null and "messages"."request_hash" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_idempotency_key_length_check" CHECK ("messages"."idempotency_key" is null or char_length("messages"."idempotency_key") between 1 and 256);
