ALTER TABLE "events" DROP CONSTRAINT "events_type_check";
DROP INDEX "events_message_id_clicked_unique";
ALTER TABLE "messages" DROP COLUMN "click_tracking_enabled";
ALTER TABLE "domains" DROP COLUMN "click_tracking_subdomain";
ALTER TABLE "domains" DROP COLUMN "click_tracking_enabled";
ALTER TABLE "events" ADD CONSTRAINT "events_type_check" CHECK ("events"."type" in ('queued', 'delivered', 'deferred', 'bounced', 'complained', 'opened'));
