-- Throwaway-database rollback for encrypted DKIM key storage.
-- Domain verification downgrades are intentionally not reversed: the old
-- verification state did not prove a DKIM record and must not become live.
DROP TABLE IF EXISTS "domain_dkim_keys";
