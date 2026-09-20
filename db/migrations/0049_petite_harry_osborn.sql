UPDATE "issue"
SET "milestone_id" = NULL
WHERE "milestone_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "project_milestone"
    WHERE "project_milestone"."id" = "issue"."milestone_id"
  );--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_milestone_id_project_milestone_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestone"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_actor_created_at" ON "activity_event" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_comment_author_created_at" ON "comment" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_issue_milestone" ON "issue" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "idx_issue_pr_link_issue" ON "issue_pr_link" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_notification_issue" ON "notification" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_notification_recipient_created_at" ON "notification" USING btree ("recipient_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_notification_unread_recipient" ON "notification" USING btree ("recipient_id") WHERE "notification"."read" = false;
