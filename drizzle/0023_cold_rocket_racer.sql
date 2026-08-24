ALTER TABLE "broadcasts" DROP CONSTRAINT "broadcasts_status_check";--> statement-breakpoint
ALTER TABLE "broadcasts" ALTER COLUMN "api_key_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "broadcasts_status_scheduled_for_idx" ON "broadcasts" USING btree ("status","scheduled_for");--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_scheduled_for_check" CHECK ("broadcasts"."status" <> 'scheduled' or "broadcasts"."scheduled_for" is not null);--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_status_check" CHECK ("broadcasts"."status" in ('scheduled', 'running', 'paused', 'completed', 'cancelled'));