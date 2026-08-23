-- Throwaway-database rollback for signed webhook delivery.
DROP TABLE IF EXISTS "webhook_deliveries";
DROP TABLE IF EXISTS "webhook_endpoints";
