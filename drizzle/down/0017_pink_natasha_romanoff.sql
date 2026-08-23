DROP TABLE "send_rate_limit_windows";
ALTER TABLE "orgs" DROP CONSTRAINT "orgs_rate_limit_order_check";
ALTER TABLE "orgs" DROP CONSTRAINT "orgs_test_rate_limit_check";
ALTER TABLE "orgs" DROP CONSTRAINT "orgs_live_rate_limit_check";
ALTER TABLE "orgs" DROP COLUMN "test_rate_limit_per_minute";
ALTER TABLE "orgs" DROP COLUMN "live_rate_limit_per_minute";
