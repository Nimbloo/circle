CREATE TABLE "team_automation" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"team_id" varchar(16) NOT NULL,
	"name" varchar(128) NOT NULL,
	"trigger" varchar(48) NOT NULL,
	"action" varchar(48) NOT NULL,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_sla" (
	"team_id" varchar(16) NOT NULL,
	"priority_id" varchar(64) NOT NULL,
	"hours" integer NOT NULL,
	CONSTRAINT "team_sla_team_id_priority_id_pk" PRIMARY KEY("team_id","priority_id")
);
--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "sla_applied_at" timestamp;--> statement-breakpoint
ALTER TABLE "team_automation" ADD CONSTRAINT "team_automation_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_sla" ADD CONSTRAINT "team_sla_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_sla" ADD CONSTRAINT "team_sla_priority_id_priority_id_fk" FOREIGN KEY ("priority_id") REFERENCES "public"."priority"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_team_automation_team" ON "team_automation" USING btree ("team_id","trigger");