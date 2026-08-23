-- Throwaway-database rollback for ordered message events.
DROP INDEX IF EXISTS "events_message_id_created_at_sequence_idx";
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_type_check";
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_data_object_check";
CREATE INDEX IF NOT EXISTS "events_message_id_created_at_idx" ON "events" USING btree ("message_id", "created_at");
ALTER TABLE "events" DROP COLUMN IF EXISTS "sequence";
ALTER TABLE "events" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "events" ALTER COLUMN "data" DROP DEFAULT;
ALTER TABLE "messages" DROP COLUMN IF EXISTS "open_tracking_enabled";
