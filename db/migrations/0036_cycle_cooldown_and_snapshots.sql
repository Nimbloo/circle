CREATE TABLE "cycle_snapshot" (
	"cycle_id" varchar(36) NOT NULL,
	"date" date NOT NULL,
	"scope" integer NOT NULL,
	"started" integer NOT NULL,
	"completed" integer NOT NULL,
	CONSTRAINT "cycle_snapshot_cycle_id_date_pk" PRIMARY KEY("cycle_id","date")
);
--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "cycle_cooldown_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cycle_snapshot" ADD CONSTRAINT "cycle_snapshot_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE cascade ON UPDATE no action;