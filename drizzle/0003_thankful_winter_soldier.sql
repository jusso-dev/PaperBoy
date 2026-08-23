ALTER TABLE "api_keys" ADD COLUMN "key_id" text;--> statement-breakpoint
UPDATE "api_keys" SET "key_id" = substring(replace(gen_random_uuid()::text, '-', '') from 1 for 16), "revoked_at" = coalesce("revoked_at", now()) WHERE "key_id" IS NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "key_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_id_unique" ON "api_keys" USING btree ("key_id");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_environment_check" CHECK ("api_keys"."environment" in ('live', 'test'));
