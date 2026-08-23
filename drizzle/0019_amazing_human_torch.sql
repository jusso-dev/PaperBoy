ALTER TABLE "orgs" ADD COLUMN "open_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
WITH "ranked_open_events" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "message_id"
			ORDER BY "created_at", "sequence", "id"
		) AS "occurrence"
	FROM "events"
	WHERE "type" = 'opened'
)
DELETE FROM "events"
USING "ranked_open_events"
WHERE "events"."id" = "ranked_open_events"."id"
	AND "ranked_open_events"."occurrence" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "events_message_id_opened_unique" ON "events" USING btree ("message_id") WHERE "events"."type" = 'opened';
