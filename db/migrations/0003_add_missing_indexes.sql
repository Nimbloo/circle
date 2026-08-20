CREATE INDEX "idx_cycle_team" ON "cycle" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_issue_created_by" ON "issue" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_issue_label_label" ON "issue_label" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "idx_issue_relation_related" ON "issue_relation" USING btree ("related_id");--> statement-breakpoint
CREATE INDEX "idx_project_team" ON "project" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_project_initiative" ON "project" USING btree ("initiative_id");--> statement-breakpoint
CREATE INDEX "idx_saved_view_owner" ON "saved_view" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_saved_view_team" ON "saved_view" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_team_member_user" ON "team_member" USING btree ("user_id");