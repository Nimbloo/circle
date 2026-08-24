CREATE INDEX "idx_project_activity_project" ON "project_activity" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_project_milestone_project" ON "project_milestone" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_resource_project" ON "project_resource" USING btree ("project_id");