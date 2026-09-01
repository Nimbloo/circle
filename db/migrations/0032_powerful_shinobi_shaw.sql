ALTER TABLE "app_user" ADD COLUMN "github_login" varchar(128);--> statement-breakpoint
ALTER TABLE "review" ADD COLUMN "requested_reviewers" varchar(512);