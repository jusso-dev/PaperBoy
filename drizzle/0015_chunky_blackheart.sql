ALTER TABLE "email_suppressions" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "email_suppressions" SET "updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "email_suppressions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "email_suppressions" ALTER COLUMN "updated_at" SET NOT NULL;
