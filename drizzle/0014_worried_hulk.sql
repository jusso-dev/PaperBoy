CREATE TABLE "feedback_ingestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"report_sha256" text NOT NULL,
	"recipient" text NOT NULL,
	"classification" text NOT NULL,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_ingestions_report_sha256_check" CHECK ("feedback_ingestions"."report_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "feedback_ingestions_recipient_check" CHECK (char_length("feedback_ingestions"."recipient") between 3 and 254 and lower("feedback_ingestions"."recipient") = "feedback_ingestions"."recipient"),
	CONSTRAINT "feedback_ingestions_classification_check" CHECK ("feedback_ingestions"."classification" in ('hard_bounce', 'soft_bounce', 'complaint')),
	CONSTRAINT "feedback_ingestions_status_check" CHECK ("feedback_ingestions"."status" is null or "feedback_ingestions"."status" ~ '^[245]\.[0-9]{1,3}\.[0-9]{1,3}$')
);
--> statement-breakpoint
ALTER TABLE "feedback_ingestions" ADD CONSTRAINT "feedback_ingestions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_ingestions" ADD CONSTRAINT "feedback_ingestions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_ingestions" ADD CONSTRAINT "feedback_ingestions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_ingestions_event_id_unique" ON "feedback_ingestions" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_ingestions_report_recipient_unique" ON "feedback_ingestions" USING btree ("report_sha256","message_id","recipient","classification");--> statement-breakpoint
CREATE INDEX "feedback_ingestions_org_id_created_at_idx" ON "feedback_ingestions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_ingestions_message_id_created_at_idx" ON "feedback_ingestions" USING btree ("message_id","created_at");