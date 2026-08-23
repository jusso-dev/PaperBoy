ALTER TABLE "orgs" DROP CONSTRAINT "orgs_outbound_provider_check";
ALTER TABLE "messages" DROP CONSTRAINT "messages_provider_mode_check";
ALTER TABLE "messages" DROP CONSTRAINT "messages_outbound_provider_check";
ALTER TABLE "domains" DROP CONSTRAINT "domains_outbound_provider_check";
ALTER TABLE "orgs" DROP COLUMN "outbound_provider";
ALTER TABLE "messages" DROP COLUMN "provider_message_id";
ALTER TABLE "messages" DROP COLUMN "outbound_provider";
ALTER TABLE "domains" DROP COLUMN "outbound_provider";
