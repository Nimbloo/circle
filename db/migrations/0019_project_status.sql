CREATE TABLE "project_status" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"color" varchar(16) NOT NULL,
	"category" varchar(32) NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
INSERT INTO "project_status" ("id","name","color","category","position") VALUES
	('proj-backlog','Backlog','#95a2b3','backlog',0),
	('proj-planned','Planned','#99a2b2','planned',1),
	('proj-in-progress','In Progress','#facc15','started',2),
	('proj-completed','Completed','#5e6ad2','completed',3),
	('proj-canceled','Canceled','#95a2b3','canceled',4)
	ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_status_id_status_id_fk";
--> statement-breakpoint
ALTER TABLE "project_template" DROP CONSTRAINT "project_template_status_id_status_id_fk";
--> statement-breakpoint
UPDATE "project" p SET "status_id" = (
	CASE (SELECT s.category FROM "status" s WHERE s.id = p.status_id)
		WHEN 'backlog' THEN 'proj-backlog'
		WHEN 'triage' THEN 'proj-backlog'
		WHEN 'unstarted' THEN 'proj-planned'
		WHEN 'started' THEN 'proj-in-progress'
		WHEN 'completed' THEN 'proj-completed'
		WHEN 'canceled' THEN 'proj-canceled'
		ELSE 'proj-backlog'
	END
);
--> statement-breakpoint
UPDATE "project_template" pt SET "status_id" = (
	CASE (SELECT s.category FROM "status" s WHERE s.id = pt.status_id)
		WHEN 'backlog' THEN 'proj-backlog'
		WHEN 'triage' THEN 'proj-backlog'
		WHEN 'unstarted' THEN 'proj-planned'
		WHEN 'started' THEN 'proj-in-progress'
		WHEN 'completed' THEN 'proj-completed'
		WHEN 'canceled' THEN 'proj-canceled'
		ELSE 'proj-backlog'
	END
) WHERE pt.status_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_status_id_project_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."project_status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_template" ADD CONSTRAINT "project_template_status_id_project_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."project_status"("id") ON DELETE no action ON UPDATE no action;
