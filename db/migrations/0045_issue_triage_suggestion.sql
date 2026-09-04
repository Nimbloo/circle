CREATE TABLE "issue_triage_suggestion" (
	"issue_id" varchar(36) PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"source" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	"dismissed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "issue_triage_suggestion" ADD CONSTRAINT "issue_triage_suggestion_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;