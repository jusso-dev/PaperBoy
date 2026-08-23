-- The forward migration's duplicate-open collapse is intentionally irreversible.
DROP INDEX "events_message_id_opened_unique";
ALTER TABLE "orgs" DROP COLUMN "open_tracking_enabled";
