CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"url" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"worker_id" text,
	"lease_expires_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"response_status" integer,
	"last_error_code" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_status_check" CHECK ("webhook_deliveries"."status" in ('queued', 'sending', 'delivered', 'failed')),
	CONSTRAINT "webhook_deliveries_attempt_count_check" CHECK ("webhook_deliveries"."attempt_count" >= 0),
	CONSTRAINT "webhook_deliveries_url_length_check" CHECK (char_length("webhook_deliveries"."url") between 1 and 2048),
	CONSTRAINT "webhook_deliveries_body_length_check" CHECK (char_length("webhook_deliveries"."body") between 2 and 65536),
	CONSTRAINT "webhook_deliveries_worker_state_check" CHECK (("webhook_deliveries"."status" = 'sending' and "webhook_deliveries"."attempt_count" > 0 and "webhook_deliveries"."last_attempt_at" is not null and "webhook_deliveries"."worker_id" is not null and "webhook_deliveries"."lease_expires_at" is not null) or ("webhook_deliveries"."status" <> 'sending' and "webhook_deliveries"."worker_id" is null and "webhook_deliveries"."lease_expires_at" is null)),
	CONSTRAINT "webhook_deliveries_delivered_state_check" CHECK (("webhook_deliveries"."status" = 'delivered' and "webhook_deliveries"."delivered_at" is not null) or ("webhook_deliveries"."status" <> 'delivered' and "webhook_deliveries"."delivered_at" is null)),
	CONSTRAINT "webhook_deliveries_failed_state_check" CHECK (("webhook_deliveries"."status" = 'failed' and "webhook_deliveries"."failed_at" is not null and "webhook_deliveries"."failure_reason" is not null) or ("webhook_deliveries"."status" <> 'failed' and "webhook_deliveries"."failed_at" is null)),
	CONSTRAINT "webhook_deliveries_response_status_check" CHECK ("webhook_deliveries"."response_status" is null or "webhook_deliveries"."response_status" between 100 and 599)
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by_user_id" text,
	"url" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoints_url_length_check" CHECK (char_length("webhook_endpoints"."url") between 1 and 2048),
	CONSTRAINT "webhook_endpoints_encrypted_secret_length_check" CHECK (char_length("webhook_endpoints"."encrypted_secret") between 32 and 1024)
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_event_id_unique" ON "webhook_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_org_id_created_at_idx" ON "webhook_deliveries" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_next_attempt_at_created_at_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoints_org_id_unique" ON "webhook_endpoints" USING btree ("org_id");