DROP TABLE "aws_ses_send_reservations";
DROP TABLE "aws_ses_rate_limit_states";
DROP TABLE "passkeys";
DROP TABLE "two_factors";
ALTER TABLE "users" DROP COLUMN "two_factor_enabled";
ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'UTC';
