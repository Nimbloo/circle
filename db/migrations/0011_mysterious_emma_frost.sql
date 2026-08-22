CREATE TABLE "issue_template" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"name" varchar(128) NOT NULL,
	"title" varchar(512),
	"description" text,
	"status_id" varchar(64),
	"priority_id" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_template" ADD CONSTRAINT "issue_template_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_template" ADD CONSTRAINT "issue_template_status_id_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_template" ADD CONSTRAINT "issue_template_priority_id_priority_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priority"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_issue_template_team" ON "issue_template" USING btree ("team_id");