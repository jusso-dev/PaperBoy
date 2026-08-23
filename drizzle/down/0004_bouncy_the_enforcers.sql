-- Throwaway-database rollback for domain DNS verification state.
ALTER TABLE "domains" DROP CONSTRAINT IF EXISTS "domains_status_check";
DROP INDEX IF EXISTS "domains_verification_token_unique";
ALTER TABLE "domains" DROP COLUMN IF EXISTS "last_checked_at";
ALTER TABLE "domains" DROP COLUMN IF EXISTS "dns_checks";
ALTER TABLE "domains" DROP COLUMN IF EXISTS "verification_token";
