CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"html" text,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_name_length_check" CHECK (char_length(btrim("email_templates"."name")) between 1 and 120),
	CONSTRAINT "email_templates_subject_length_check" CHECK (char_length(btrim("email_templates"."subject")) between 1 and 998 and "email_templates"."subject" !~ '[
]'),
	CONSTRAINT "email_templates_html_length_check" CHECK ("email_templates"."html" is null or char_length("email_templates"."html") between 1 and 2097152),
	CONSTRAINT "email_templates_text_length_check" CHECK ("email_templates"."text" is null or char_length("email_templates"."text") between 1 and 2097152),
	CONSTRAINT "email_templates_body_check" CHECK ("email_templates"."html" is not null or "email_templates"."text" is not null)
);
--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_org_id_name_unique" ON "email_templates" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "email_templates_org_id_idx" ON "email_templates" USING btree ("org_id");