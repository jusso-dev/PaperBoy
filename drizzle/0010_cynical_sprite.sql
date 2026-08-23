CREATE TABLE "broadcast_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"message_id" uuid,
	"position" integer NOT NULL,
	"email" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_code" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_recipients_position_check" CHECK ("broadcast_recipients"."position" between 0 and 99),
	CONSTRAINT "broadcast_recipients_email_check" CHECK (char_length("broadcast_recipients"."email") between 3 and 254 and lower("broadcast_recipients"."email") = "broadcast_recipients"."email"),
	CONSTRAINT "broadcast_recipients_data_object_check" CHECK (jsonb_typeof("broadcast_recipients"."data") = 'object'),
	CONSTRAINT "broadcast_recipients_status_check" CHECK ("broadcast_recipients"."status" in ('pending', 'processing', 'queued', 'suppressed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"created_by_user_id" text,
	"source_template_id" uuid,
	"name" text NOT NULL,
	"from" text NOT NULL,
	"template_name" text NOT NULL,
	"template_required_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"template_subject" text NOT NULL,
	"template_html" text,
	"template_text" text,
	"environment" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcasts_name_length_check" CHECK (char_length(btrim("broadcasts"."name")) between 1 and 120),
	CONSTRAINT "broadcasts_from_length_check" CHECK (char_length("broadcasts"."from") between 3 and 320),
	CONSTRAINT "broadcasts_status_check" CHECK ("broadcasts"."status" in ('running', 'paused', 'completed', 'cancelled')),
	CONSTRAINT "broadcasts_environment_check" CHECK ("broadcasts"."environment" in ('live', 'test')),
	CONSTRAINT "broadcasts_template_required_variables_array_check" CHECK (jsonb_typeof("broadcasts"."template_required_variables") = 'array'),
	CONSTRAINT "broadcasts_template_body_check" CHECK ("broadcasts"."template_html" is not null or "broadcasts"."template_text" is not null)
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_email_check" CHECK (char_length("email_suppressions"."email") between 3 and 254 and lower("email_suppressions"."email") = "email_suppressions"."email"),
	CONSTRAINT "email_suppressions_reason_check" CHECK ("email_suppressions"."reason" in ('manual', 'bounced', 'complained'))
);
--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_source_template_id_email_templates_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_recipients_broadcast_id_position_unique" ON "broadcast_recipients" USING btree ("broadcast_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_recipients_broadcast_id_email_unique" ON "broadcast_recipients" USING btree ("broadcast_id","email");--> statement-breakpoint
CREATE INDEX "broadcast_recipients_broadcast_id_status_position_idx" ON "broadcast_recipients" USING btree ("broadcast_id","status","position");--> statement-breakpoint
CREATE INDEX "broadcast_recipients_message_id_idx" ON "broadcast_recipients" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "broadcasts_org_id_created_at_idx" ON "broadcasts" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "broadcasts_status_created_at_idx" ON "broadcasts" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_org_id_email_unique" ON "email_suppressions" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "email_suppressions_org_id_idx" ON "email_suppressions" USING btree ("org_id");