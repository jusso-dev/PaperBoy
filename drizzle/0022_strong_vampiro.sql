CREATE TABLE "aws_ses_rate_limit_states" (
	"scope_hash" text PRIMARY KEY NOT NULL,
	"next_available_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aws_ses_rate_limit_states_scope_hash_check" CHECK ("aws_ses_rate_limit_states"."scope_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "aws_ses_send_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_hash" text NOT NULL,
	"reservation_key" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aws_ses_send_reservations_scope_hash_check" CHECK ("aws_ses_send_reservations"."scope_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "aws_ses_send_reservations_reservation_key_check" CHECK ("aws_ses_send_reservations"."reservation_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "aws_ses_send_reservations_recipient_count_check" CHECK ("aws_ses_send_reservations"."recipient_count" between 1 and 2500)
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aaguid" text,
	CONSTRAINT "passkeys_counter_check" CHECK ("passkeys"."counter" >= 0)
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	CONSTRAINT "two_factors_failed_verification_count_check" CHECK ("two_factors"."failed_verification_count" >= 0)
);
--> statement-breakpoint
UPDATE "users" SET "timezone" = 'Australia/Sydney';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'Australia/Sydney';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "aws_ses_send_reservations" ADD CONSTRAINT "aws_ses_send_reservations_scope_hash_aws_ses_rate_limit_states_scope_hash_fk" FOREIGN KEY ("scope_hash") REFERENCES "public"."aws_ses_rate_limit_states"("scope_hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aws_ses_send_reservations_scope_key_unique" ON "aws_ses_send_reservations" USING btree ("scope_hash","reservation_key");--> statement-breakpoint
CREATE INDEX "aws_ses_send_reservations_scope_scheduled_at_idx" ON "aws_ses_send_reservations" USING btree ("scope_hash","scheduled_at");--> statement-breakpoint
CREATE INDEX "passkeys_user_id_idx" ON "passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passkeys_credential_id_unique" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "two_factors_user_id_unique" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "two_factors" USING btree ("secret");
