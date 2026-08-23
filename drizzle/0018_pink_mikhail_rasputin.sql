CREATE INDEX "messages_org_id_created_at_id_idx" ON "messages" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_org_id_status_created_at_id_idx" ON "messages" USING btree ("org_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_org_id_domain_id_created_at_id_idx" ON "messages" USING btree ("org_id","domain_id","created_at","id");