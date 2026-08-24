DELETE FROM "broadcasts" WHERE "status" = 'scheduled' OR "api_key_id" IS NULL;
ALTER TABLE "broadcasts" DROP CONSTRAINT "broadcasts_scheduled_for_check";
ALTER TABLE "broadcasts" DROP CONSTRAINT "broadcasts_status_check";
DROP INDEX "broadcasts_status_scheduled_for_idx";
ALTER TABLE "broadcasts" DROP COLUMN "scheduled_for";
ALTER TABLE "broadcasts" ALTER COLUMN "api_key_id" SET NOT NULL;
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_status_check" CHECK ("broadcasts"."status" in ('running', 'paused', 'completed', 'cancelled'));
