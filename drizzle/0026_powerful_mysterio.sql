CREATE TABLE "received_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"api_key_id" uuid,
	"domain_id" uuid,
	"environment" text DEFAULT 'test' NOT NULL,
	"from" text NOT NULL,
	"to" jsonb NOT NULL,
	"cc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bcc" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"html" text,
	"text" text,
	"rfc822_message_id" text,
	"content_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "received_emails_environment_check" CHECK ("received_emails"."environment" in ('live', 'test')),
	CONSTRAINT "received_emails_to_array_check" CHECK (jsonb_typeof("received_emails"."to") = 'array'),
	CONSTRAINT "received_emails_cc_array_check" CHECK (jsonb_typeof("received_emails"."cc") = 'array'),
	CONSTRAINT "received_emails_bcc_array_check" CHECK (jsonb_typeof("received_emails"."bcc") = 'array'),
	CONSTRAINT "received_emails_body_check" CHECK ("received_emails"."html" is not null or "received_emails"."text" is not null),
	CONSTRAINT "received_emails_content_sha256_check" CHECK ("received_emails"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "received_emails_rfc822_message_id_check" CHECK ("received_emails"."rfc822_message_id" is null or (char_length("received_emails"."rfc822_message_id") between 3 and 998 and "received_emails"."rfc822_message_id" !~ '[[:cntrl:]]'))
);
--> statement-breakpoint
DROP INDEX "webhook_deliveries_event_id_unique";--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "reply_to" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "received_email_id" uuid;--> statement-breakpoint
ALTER TABLE "received_emails" ADD CONSTRAINT "received_emails_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "received_emails" ADD CONSTRAINT "received_emails_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "received_emails" ADD CONSTRAINT "received_emails_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "received_emails_org_id_content_sha256_unique" ON "received_emails" USING btree ("org_id","content_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "received_emails_org_id_rfc822_message_id_unique" ON "received_emails" USING btree ("org_id","rfc822_message_id") WHERE "received_emails"."rfc822_message_id" is not null;--> statement-breakpoint
CREATE INDEX "received_emails_org_id_created_at_id_idx" ON "received_emails" USING btree ("org_id","created_at","id");--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_received_email_id_received_emails_id_fk" FOREIGN KEY ("received_email_id") REFERENCES "public"."received_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_received_email_id_unique" ON "webhook_deliveries" USING btree ("received_email_id") WHERE "webhook_deliveries"."received_email_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_event_id_unique" ON "webhook_deliveries" USING btree ("event_id") WHERE "webhook_deliveries"."event_id" is not null;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_array_check" CHECK (jsonb_typeof("messages"."reply_to") = 'array');--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_source_check" CHECK (("webhook_deliveries"."event_id" is not null and "webhook_deliveries"."received_email_id" is null) or ("webhook_deliveries"."event_id" is null and "webhook_deliveries"."received_email_id" is not null));