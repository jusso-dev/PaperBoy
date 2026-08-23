DROP INDEX "events_message_id_created_at_idx";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "data" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
UPDATE "events" SET "data" = '{}'::jsonb WHERE "data" IS NULL;--> statement-breakpoint
UPDATE "events" SET "data" = jsonb_build_object('legacy_data', "data") WHERE jsonb_typeof("data") <> 'object';--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "data" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "open_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "events_message_id_created_at_sequence_idx" ON "events" USING btree ("message_id","created_at","sequence");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_type_check" CHECK ("events"."type" in ('queued', 'delivered', 'bounced', 'complained', 'opened'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_data_object_check" CHECK (jsonb_typeof("events"."data") = 'object');--> statement-breakpoint
INSERT INTO "events" ("message_id", "type", "data", "created_at")
SELECT "messages"."id", 'queued', '{"backfilled":true}'::jsonb, "messages"."created_at"
FROM "messages"
WHERE NOT EXISTS (
	SELECT 1
	FROM "events"
	WHERE "events"."message_id" = "messages"."id"
		AND "events"."type" = 'queued'
);--> statement-breakpoint
INSERT INTO "events" ("message_id", "type", "data", "created_at")
SELECT "messages"."id", 'delivered', '{"backfilled":true}'::jsonb, COALESCE("messages"."sent_at", "messages"."updated_at")
FROM "messages"
WHERE "messages"."status" = 'sent'
	AND NOT EXISTS (
		SELECT 1
		FROM "events"
		WHERE "events"."message_id" = "messages"."id"
			AND "events"."type" = 'delivered'
	);
