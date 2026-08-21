ALTER TABLE "issue" ADD COLUMN "sentry_issue_id" varchar(128);--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_sentry_issue_id_unique" UNIQUE("sentry_issue_id");