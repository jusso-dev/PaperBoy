CREATE TABLE "provider_event_ingestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"suppression_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_event_ingestions_provider_check" CHECK ("provider_event_ingestions"."provider" in ('smtp', 'cloudflare-email', 'aws-ses', 'azure-email')),
	CONSTRAINT "provider_event_ingestions_provider_event_id_check" CHECK (char_length("provider_event_ingestions"."provider_event_id") between 1 and 1000 and "provider_event_ingestions"."provider_event_id" !~ '[[:cntrl:]]'),
	CONSTRAINT "provider_event_ingestions_payload_sha256_check" CHECK ("provider_event_ingestions"."payload_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "provider_event_ingestions_suppression_count_check" CHECK ("provider_event_ingestions"."suppression_count" between 0 and 50)
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_type_check";--> statement-breakpoint
ALTER TABLE "provider_event_ingestions" ADD CONSTRAINT "provider_event_ingestions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_event_ingestions" ADD CONSTRAINT "provider_event_ingestions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_event_ingestions" ADD CONSTRAINT "provider_event_ingestions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_event_ingestions_event_id_unique" ON "provider_event_ingestions" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_event_ingestions_provider_event_unique" ON "provider_event_ingestions" USING btree ("org_id","provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "provider_event_ingestions_message_created_at_idx" ON "provider_event_ingestions" USING btree ("message_id","created_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_type_check" CHECK ("events"."type" in ('queued', 'delivered', 'deferred', 'bounced', 'complained', 'opened'));