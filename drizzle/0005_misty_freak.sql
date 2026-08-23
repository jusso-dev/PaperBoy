CREATE TABLE "domain_dkim_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"selector" text NOT NULL,
	"public_key" text NOT NULL,
	"encrypted_private_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"dns_status" text DEFAULT 'unchecked' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_dkim_keys_status_check" CHECK ("domain_dkim_keys"."status" in ('pending', 'active', 'retiring', 'retired')),
	CONSTRAINT "domain_dkim_keys_dns_status_check" CHECK ("domain_dkim_keys"."dns_status" in ('unchecked', 'matched', 'missing', 'error', 'pending')),
	CONSTRAINT "domain_dkim_keys_private_key_state_check" CHECK (("domain_dkim_keys"."status" = 'retired' and "domain_dkim_keys"."encrypted_private_key" is null) or ("domain_dkim_keys"."status" <> 'retired' and "domain_dkim_keys"."encrypted_private_key" is not null))
);
--> statement-breakpoint
ALTER TABLE "domain_dkim_keys" ADD CONSTRAINT "domain_dkim_keys_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domain_dkim_keys_domain_id_selector_unique" ON "domain_dkim_keys" USING btree ("domain_id","selector");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_dkim_keys_domain_id_active_unique" ON "domain_dkim_keys" USING btree ("domain_id") WHERE "domain_dkim_keys"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "domain_dkim_keys_domain_id_pending_unique" ON "domain_dkim_keys" USING btree ("domain_id") WHERE "domain_dkim_keys"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "domain_dkim_keys_domain_id_retiring_unique" ON "domain_dkim_keys" USING btree ("domain_id") WHERE "domain_dkim_keys"."status" = 'retiring';--> statement-breakpoint
CREATE INDEX "domain_dkim_keys_domain_id_idx" ON "domain_dkim_keys" USING btree ("domain_id");
--> statement-breakpoint
-- Existing domains predate DKIM keys. Require an explicit setup and fresh DNS check.
UPDATE "domains"
SET
	"status" = 'pending',
	"verified_at" = NULL,
	"dns_checks" = jsonb_set(COALESCE("dns_checks", '{}'::jsonb), '{dkim}', '"pending"'::jsonb, true),
	"updated_at" = now()
WHERE "status" = 'verified';
