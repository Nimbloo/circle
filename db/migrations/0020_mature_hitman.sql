CREATE TABLE "issue_reaction" (
	"issue_id" varchar(36) NOT NULL,
	"emoji" varchar(32) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	CONSTRAINT "issue_reaction_issue_id_emoji_user_id_pk" PRIMARY KEY("issue_id","emoji","user_id")
);
--> statement-breakpoint
ALTER TABLE "issue_reaction" ADD CONSTRAINT "issue_reaction_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_reaction" ADD CONSTRAINT "issue_reaction_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;