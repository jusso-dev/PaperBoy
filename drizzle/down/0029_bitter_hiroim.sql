ALTER TABLE "messages" DROP CONSTRAINT "messages_status_check";
ALTER TABLE "messages" DROP CONSTRAINT "messages_cancelled_state_check";
ALTER TABLE "events" DROP CONSTRAINT "events_type_check";
ALTER TABLE "messages" DROP COLUMN "cancelled_at";
ALTER TABLE "messages" DROP COLUMN "scheduled_at";
ALTER TABLE "events" ADD CONSTRAINT "events_type_check" CHECK ("events"."type" in ('queued', 'delivered', 'deferred', 'bounced', 'complained', 'opened', 'clicked'));
ALTER TABLE "messages" ADD CONSTRAINT "messages_status_check" CHECK ("messages"."status" in ('queued', 'sending', 'sent', 'failed'));
