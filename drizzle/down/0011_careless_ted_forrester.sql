-- Throwaway-database rollback for the durable outbound worker state.
DROP INDEX IF EXISTS "messages_status_next_attempt_at_created_at_idx";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_attempt_count_check";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_worker_id_check";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_last_error_code_check";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_failure_reason_check";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_worker_lease_state_check";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_sent_state_check";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_failed_state_check";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "attempt_count";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "next_attempt_at";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "last_attempt_at";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "worker_id";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "lease_expires_at";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "sent_at";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "failed_at";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "last_error_code";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "failure_reason";
