ALTER TABLE "messages" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "worker_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "failure_reason" text;--> statement-breakpoint
UPDATE "messages" SET "status" = 'queued', "updated_at" = now(), "next_attempt_at" = now() WHERE "status" = 'sending';--> statement-breakpoint
UPDATE "messages" SET "sent_at" = "updated_at" WHERE "status" = 'sent';--> statement-breakpoint
UPDATE "messages" SET "failed_at" = "updated_at", "last_error_code" = 'legacy_failure', "failure_reason" = 'Legacy delivery failure.' WHERE "status" = 'failed';--> statement-breakpoint
CREATE INDEX "messages_status_next_attempt_at_created_at_idx" ON "messages" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_attempt_count_check" CHECK ("messages"."attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_worker_id_check" CHECK ("messages"."worker_id" is null or (char_length("messages"."worker_id") between 1 and 128 and "messages"."worker_id" !~ '[[:cntrl:]]'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_last_error_code_check" CHECK ("messages"."last_error_code" is null or "messages"."last_error_code" ~ '^[a-z0-9][a-z0-9_:-]{0,127}$');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_failure_reason_check" CHECK ("messages"."failure_reason" is null or char_length("messages"."failure_reason") between 1 and 1000);--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_worker_lease_state_check" CHECK (("messages"."status" = 'sending' and "messages"."attempt_count" > 0 and "messages"."last_attempt_at" is not null and "messages"."worker_id" is not null and "messages"."lease_expires_at" is not null) or ("messages"."status" <> 'sending' and "messages"."worker_id" is null and "messages"."lease_expires_at" is null));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_state_check" CHECK (("messages"."status" = 'sent' and "messages"."sent_at" is not null) or ("messages"."status" <> 'sent' and "messages"."sent_at" is null));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_failed_state_check" CHECK (("messages"."status" = 'failed' and "messages"."failed_at" is not null and "messages"."failure_reason" is not null) or ("messages"."status" <> 'failed' and "messages"."failed_at" is null));
