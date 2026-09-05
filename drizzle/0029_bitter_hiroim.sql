ALTER TABLE "events" DROP CONSTRAINT "events_type_check";--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_status_check";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_type_check" CHECK ("events"."type" in ('queued', 'delivered', 'deferred', 'bounced', 'complained', 'opened', 'clicked', 'scheduled', 'cancelled'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_cancelled_state_check" CHECK (("messages"."status" = 'cancelled' and "messages"."cancelled_at" is not null and "messages"."sent_at" is null and "messages"."failed_at" is null) or ("messages"."status" <> 'cancelled' and "messages"."cancelled_at" is null));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_status_check" CHECK ("messages"."status" in ('queued', 'sending', 'sent', 'failed', 'cancelled'));