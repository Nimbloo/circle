CREATE TABLE "activity_event" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"actor_id" varchar(36),
	"event" varchar(32) NOT NULL,
	"text" varchar(1024),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"email" varchar(255) NOT NULL,
	"avatar_url" varchar(512),
	"role" varchar(16) DEFAULT 'Member' NOT NULL,
	"presence" varchar(16) DEFAULT 'offline' NOT NULL,
	"timezone" varchar(64),
	"joined_at" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_slug_unique" UNIQUE("slug"),
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_reaction" (
	"comment_id" varchar(36) NOT NULL,
	"emoji" varchar(32) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	CONSTRAINT "comment_reaction_comment_id_emoji_user_id_pk" PRIMARY KEY("comment_id","emoji","user_id")
);
--> statement-breakpoint
CREATE TABLE "cycle" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"name" varchar(96) NOT NULL,
	"team_id" varchar(16) NOT NULL,
	"status" varchar(16) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_folder" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"team_id" varchar(16) NOT NULL,
	"name" varchar(196) NOT NULL,
	"icon" varchar(16)
);
--> statement-breakpoint
CREATE TABLE "health" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"color" varchar(16) NOT NULL,
	"description" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "initiative" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" varchar(196) NOT NULL,
	"description" text,
	"icon" varchar(16),
	"status" varchar(16) NOT NULL,
	"priority_id" varchar(64) NOT NULL,
	"owner_id" varchar(36),
	"target" varchar(64),
	"health_id" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "initiative_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "initiative_project" (
	"initiative_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	CONSTRAINT "initiative_project_initiative_id_project_id_pk" PRIMARY KEY("initiative_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "issue" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"identifier" varchar(32) NOT NULL,
	"team_id" varchar(16) NOT NULL,
	"title" varchar(512) NOT NULL,
	"status_id" varchar(64) NOT NULL,
	"priority_id" varchar(64) NOT NULL,
	"assignee_id" varchar(36),
	"created_by_id" varchar(36),
	"project_id" varchar(36),
	"cycle_id" varchar(36),
	"rank" varchar(64) NOT NULL,
	"due_date" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "issue_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "issue_content" (
	"issue_id" varchar(36) PRIMARY KEY NOT NULL,
	"description" text,
	"milestone" varchar(196)
);
--> statement-breakpoint
CREATE TABLE "issue_label" (
	"issue_id" varchar(36) NOT NULL,
	"label_id" varchar(64) NOT NULL,
	CONSTRAINT "issue_label_issue_id_label_id_pk" PRIMARY KEY("issue_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "issue_pr_link" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"title" varchar(512) NOT NULL,
	"status" varchar(16) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_relation" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"related_id" varchar(36) NOT NULL,
	"kind" varchar(16) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "label" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"color" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36),
	"actor_id" varchar(36),
	"recipient_id" varchar(36) NOT NULL,
	"type" varchar(16) NOT NULL,
	"content" varchar(1024),
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priority" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"position" integer NOT NULL,
	"sort_rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(196) NOT NULL,
	"status_id" varchar(64) NOT NULL,
	"icon_key" varchar(64),
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"start_date" date,
	"target_date" date,
	"lead_id" varchar(36),
	"priority_id" varchar(64) NOT NULL,
	"health_id" varchar(64) NOT NULL,
	"team_id" varchar(16) NOT NULL,
	"initiative_id" varchar(36),
	"health_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activity" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"text" varchar(1024) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_detail" (
	"project_id" varchar(36) PRIMARY KEY NOT NULL,
	"summary" varchar(1024),
	"description" text
);
--> statement-breakpoint
CREATE TABLE "project_label" (
	"project_id" varchar(36) NOT NULL,
	"label_id" varchar(64) NOT NULL,
	CONSTRAINT "project_label_project_id_label_id_pk" PRIMARY KEY("project_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "project_milestone" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"name" varchar(196) NOT NULL,
	"target_date" date,
	"completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_resource" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"label" varchar(196) NOT NULL,
	"url" varchar(1024) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_update" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"health" varchar(16) NOT NULL,
	"blocks" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_view" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" varchar(196) NOT NULL,
	"description" text,
	"icon" varchar(16),
	"type" varchar(16) NOT NULL,
	"team_id" varchar(16),
	"owner_id" varchar(36) NOT NULL,
	"filter" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"color" varchar(16) NOT NULL,
	"category" varchar(32) NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"icon" varchar(16),
	"color" varchar(16),
	"issue_seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_document" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"folder_id" varchar(64) NOT NULL,
	"name" varchar(196) NOT NULL,
	"icon" varchar(16),
	"creator_id" varchar(36) NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"team_id" varchar(16) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"joined" boolean DEFAULT true NOT NULL,
	CONSTRAINT "team_member_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reaction" ADD CONSTRAINT "comment_reaction_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_folder" ADD CONSTRAINT "document_folder_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_priority_id_priority_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priority"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_health_id_health_id_fk" FOREIGN KEY ("health_id") REFERENCES "public"."health"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_project" ADD CONSTRAINT "initiative_project_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_project" ADD CONSTRAINT "initiative_project_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_status_id_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_priority_id_priority_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priority"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_assignee_id_app_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_created_by_id_app_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_content" ADD CONSTRAINT "issue_content_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label" ADD CONSTRAINT "issue_label_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label" ADD CONSTRAINT "issue_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_pr_link" ADD CONSTRAINT "issue_pr_link_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relation" ADD CONSTRAINT "issue_relation_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relation" ADD CONSTRAINT "issue_relation_related_id_issue_id_fk" FOREIGN KEY ("related_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_id_app_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_status_id_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_lead_id_app_user_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_priority_id_priority_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priority"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_health_id_health_id_fk" FOREIGN KEY ("health_id") REFERENCES "public"."health"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activity" ADD CONSTRAINT "project_activity_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_detail" ADD CONSTRAINT "project_detail_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_label" ADD CONSTRAINT "project_label_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_label" ADD CONSTRAINT "project_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resource" ADD CONSTRAINT "project_resource_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_document" ADD CONSTRAINT "team_document_folder_id_document_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."document_folder"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_document" ADD CONSTRAINT "team_document_creator_id_app_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_issue" ON "activity_event" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_comment_issue" ON "comment" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_issue_team" ON "issue" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_issue_status" ON "issue" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "idx_issue_project" ON "issue" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_issue_cycle" ON "issue" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "idx_issue_assignee" ON "issue" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_issue_rank" ON "issue" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "idx_issue_relation_issue" ON "issue_relation" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_notification_recipient" ON "notification" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "idx_project_update_project" ON "project_update" USING btree ("project_id");