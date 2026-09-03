CREATE TABLE "issue_assignee" (
	"issue_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "issue_assignee_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "issue_assignee" ADD CONSTRAINT "issue_assignee_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignee" ADD CONSTRAINT "issue_assignee_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_issue_assignee_user" ON "issue_assignee" USING btree ("user_id");--> statement-breakpoint
-- Backfill idempotente: o responsável atual (issue.assignee_id) vira a única linha do
-- conjunto. Re-executar não duplica (PK issue_id+user_id).
INSERT INTO "issue_assignee" ("issue_id", "user_id", "created_at")
SELECT "id", "assignee_id", "created_at" FROM "issue" WHERE "assignee_id" IS NOT NULL
ON CONFLICT DO NOTHING;