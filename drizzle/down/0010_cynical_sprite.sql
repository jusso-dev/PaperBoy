-- Throwaway-database rollback for simple broadcasts and suppression checks.
DROP TABLE IF EXISTS "broadcast_recipients";
DROP TABLE IF EXISTS "broadcasts";
DROP TABLE IF EXISTS "email_suppressions";
