ALTER TABLE "events" DROP CONSTRAINT "events_type_check";--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "click_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "click_tracking_subdomain" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "click_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "events_message_id_clicked_unique" ON "events" USING btree ("message_id") WHERE "events"."type" = 'clicked';--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_type_check" CHECK ("events"."type" in ('queued', 'delivered', 'deferred', 'bounced', 'complained', 'opened', 'clicked'));