CREATE TABLE "issue_resource" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"kind" varchar(16) DEFAULT 'link' NOT NULL,
	"label" varchar(196) NOT NULL,
	"url" varchar(1024) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_resource" ADD CONSTRAINT "issue_resource_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_issue_resource_issue" ON "issue_resource" USING btree ("issue_id");