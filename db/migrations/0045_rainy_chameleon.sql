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
ALTER TABLE "project_dependency" ADD CONSTRAINT "project_dependency_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependency" ADD CONSTRAINT "project_dependency_depends_on_id_project_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."project"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_snapshot" ADD CONSTRAINT "project_snapshot_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_dependency_depends_on" ON "project_dependency" USING btree ("depends_on_id");