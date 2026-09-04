CREATE TABLE "api_token" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"prefix" varchar(32) NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "issue_import" (
	"source" varchar(32) NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "issue_import_source_external_id_pk" PRIMARY KEY("source","external_id")
);
--> statement-breakpoint
CREATE TABLE "issue_triage_suggestion" (
	"issue_id" varchar(36) PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"source" varchar(16) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"applied_at" timestamp,
	"dismissed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_dependency" (
	"project_id" varchar(36) NOT NULL,
	"depends_on_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_dependency_project_id_depends_on_id_pk" PRIMARY KEY("project_id","depends_on_id")
);
--> statement-breakpoint
CREATE TABLE "project_snapshot" (
	"project_id" varchar(36) NOT NULL,
	"date" date NOT NULL,
	"scope" integer NOT NULL,
	"started" integer NOT NULL,
	"completed" integer NOT NULL,
	CONSTRAINT "project_snapshot_project_id_date_pk" PRIMARY KEY("project_id","date")
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"url" varchar(512) NOT NULL,
	"secret" varchar(128) NOT NULL,
	"events" text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"webhook_id" varchar(36) NOT NULL,
	"event" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"response_code" integer,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_import" ADD CONSTRAINT "issue_import_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_triage_suggestion" ADD CONSTRAINT "issue_triage_suggestion_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependency" ADD CONSTRAINT "project_dependency_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependency" ADD CONSTRAINT "project_dependency_depends_on_id_project_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_snapshot" ADD CONSTRAINT "project_snapshot_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_webhook_id_webhook_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhook"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_token_created_by" ON "api_token" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_issue_import_issue" ON "issue_import" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_project_dependency_depends_on" ON "project_dependency" USING btree ("depends_on_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_enabled" ON "webhook" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_webhook_delivery_hook" ON "webhook_delivery" USING btree ("webhook_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_delivery_pending" ON "webhook_delivery" USING btree ("status","next_attempt_at");