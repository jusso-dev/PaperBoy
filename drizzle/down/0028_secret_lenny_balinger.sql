ALTER TABLE "messages" DROP CONSTRAINT "messages_headers_object_check";
ALTER TABLE "messages" DROP CONSTRAINT "messages_bcc_array_check";
ALTER TABLE "messages" DROP CONSTRAINT "messages_cc_array_check";
ALTER TABLE "message_attachments" DROP CONSTRAINT "message_attachments_content_id_check";
ALTER TABLE "messages" DROP COLUMN "headers";
ALTER TABLE "messages" DROP COLUMN "bcc";
ALTER TABLE "messages" DROP COLUMN "cc";
ALTER TABLE "message_attachments" DROP COLUMN "content_id";
