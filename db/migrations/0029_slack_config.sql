CREATE TABLE "slack_config" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"on_issue_created" boolean DEFAULT true NOT NULL,
	"on_issue_completed" boolean DEFAULT true NOT NULL,
	"on_issue_assigned" boolean DEFAULT true NOT NULL,
	"on_pr_merged" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
