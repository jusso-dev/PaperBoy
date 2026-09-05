ALTER TABLE "message_attachments" ADD COLUMN "content_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "cc" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "bcc" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "headers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_content_id_check" CHECK ("message_attachments"."content_id" is null or (char_length("message_attachments"."content_id") between 1 and 256 and "message_attachments"."content_id" !~ '[[:space:]<>,]'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_cc_array_check" CHECK (jsonb_typeof("messages"."cc") = 'array');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_bcc_array_check" CHECK (jsonb_typeof("messages"."bcc") = 'array');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_headers_object_check" CHECK (jsonb_typeof("messages"."headers") = 'object');