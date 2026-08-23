-- Throwaway-database rollback for required template variables.
ALTER TABLE "email_templates" DROP COLUMN IF EXISTS "required_variables";
