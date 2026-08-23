DROP TABLE IF EXISTS "org_invites";
DROP TABLE IF EXISTS "org_members";
ALTER TABLE "users" DROP COLUMN IF EXISTS "active_org_id";
ALTER TABLE "users" DROP COLUMN IF EXISTS "default_org_id";
