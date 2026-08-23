CREATE TABLE "audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audiences_name_length_check" CHECK (char_length(btrim("audiences"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audience_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_email_check" CHECK (char_length("contacts"."email") between 3 and 254 and lower("contacts"."email") = "contacts"."email"),
	CONSTRAINT "contacts_name_length_check" CHECK ("contacts"."name" is null or char_length(btrim("contacts"."name")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "email_suppressions" DROP CONSTRAINT "email_suppressions_reason_check";--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "source_audience_id" uuid;--> statement-breakpoint
ALTER TABLE "audiences" ADD CONSTRAINT "audiences_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_audience_id_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audiences_org_id_name_unique" ON "audiences" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "audiences_org_id_created_at_idx" ON "audiences" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_audience_id_email_unique" ON "contacts" USING btree ("audience_id","email");--> statement-breakpoint
CREATE INDEX "contacts_audience_id_created_at_idx" ON "contacts" USING btree ("audience_id","created_at");--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_source_audience_id_audiences_id_fk" FOREIGN KEY ("source_audience_id") REFERENCES "public"."audiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broadcast_recipients_contact_id_idx" ON "broadcast_recipients" USING btree ("contact_id");--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_reason_check" CHECK ("email_suppressions"."reason" in ('manual', 'unsubscribed', 'bounced', 'complained'));