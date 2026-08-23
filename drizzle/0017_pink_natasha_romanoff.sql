CREATE TABLE "send_rate_limit_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"accepted_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "send_rate_limit_windows_environment_check" CHECK ("send_rate_limit_windows"."environment" in ('live', 'test')),
	CONSTRAINT "send_rate_limit_windows_accepted_count_check" CHECK ("send_rate_limit_windows"."accepted_count" between 1 and 1000000)
);
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "live_rate_limit_per_minute" integer;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "test_rate_limit_per_minute" integer;--> statement-breakpoint
ALTER TABLE "send_rate_limit_windows" ADD CONSTRAINT "send_rate_limit_windows_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "send_rate_limit_windows_org_environment_unique" ON "send_rate_limit_windows" USING btree ("org_id","environment");--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_live_rate_limit_check" CHECK ("orgs"."live_rate_limit_per_minute" is null or "orgs"."live_rate_limit_per_minute" between 1 and 1000000);--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_test_rate_limit_check" CHECK ("orgs"."test_rate_limit_per_minute" is null or "orgs"."test_rate_limit_per_minute" between 1 and 1000000);--> statement-breakpoint
ALTER TABLE "orgs" ADD CONSTRAINT "orgs_rate_limit_order_check" CHECK ("orgs"."live_rate_limit_per_minute" is null or "orgs"."test_rate_limit_per_minute" is null or "orgs"."test_rate_limit_per_minute" > "orgs"."live_rate_limit_per_minute");