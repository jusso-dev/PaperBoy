CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content_sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_attachments_position_check" CHECK ("message_attachments"."position" between 0 and 99),
	CONSTRAINT "message_attachments_byte_size_check" CHECK ("message_attachments"."byte_size" between 1 and 10485760),
	CONSTRAINT "message_attachments_content_sha256_check" CHECK ("message_attachments"."content_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "message_attachments_filename_length_check" CHECK (char_length("message_attachments"."filename") between 1 and 255),
	CONSTRAINT "message_attachments_content_type_check" CHECK ("message_attachments"."content_type" ~ '^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$')
);
--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_attachments_storage_key_unique" ON "message_attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "message_attachments_message_id_position_unique" ON "message_attachments" USING btree ("message_id","position");--> statement-breakpoint
CREATE INDEX "message_attachments_message_id_idx" ON "message_attachments" USING btree ("message_id");