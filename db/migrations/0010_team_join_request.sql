CREATE TABLE "team_join_request" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"team_id" varchar(16) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" varchar(36),
	CONSTRAINT "team_join_request_team_user_unique" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "team_join_request" ADD CONSTRAINT "team_join_request_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_request" ADD CONSTRAINT "team_join_request_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_request" ADD CONSTRAINT "team_join_request_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_team_join_request_team" ON "team_join_request" USING btree ("team_id");