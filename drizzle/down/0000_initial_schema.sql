-- Throwaway-database rollback for validating the initial migration.
DROP TABLE IF EXISTS "events";
DROP TABLE IF EXISTS "messages";
DROP TABLE IF EXISTS "domains";
DROP TABLE IF EXISTS "api_keys";
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "orgs";
DROP TABLE IF EXISTS "drizzle"."__drizzle_migrations";
DROP SCHEMA IF EXISTS "drizzle";
