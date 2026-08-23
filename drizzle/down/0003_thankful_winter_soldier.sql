ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_environment_check";
ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "key_id";
