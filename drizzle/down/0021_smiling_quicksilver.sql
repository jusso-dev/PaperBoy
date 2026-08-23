-- Throwaway-database rollback for SES event ingestion.
DROP TABLE IF EXISTS "provider_event_ingestions";
DELETE FROM "events" WHERE "type" = 'deferred';
ALTER TABLE "events" DROP CONSTRAINT "events_type_check";
ALTER TABLE "events" ADD CONSTRAINT "events_type_check"
  CHECK ("events"."type" in ('queued', 'delivered', 'bounced', 'complained', 'opened'));
