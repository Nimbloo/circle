CREATE TABLE IF NOT EXISTS "import_job" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"owner_id" varchar(36) NOT NULL,
	"team_id" varchar(16) NOT NULL,
	"source" varchar(32) NOT NULL,
	"status" varchar(16) NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "issue" ALTER COLUMN "rank" SET DATA TYPE text;--> statement-breakpoint
-- #1: normaliza os ranks existentes na sequência curta do rebalanceamento da aplicação
-- (rebalanceTeamRanks). A ordem LexoRank é preservada por time; nenhuma issue é descartada.
WITH ordered AS (
	SELECT "id", row_number() OVER (PARTITION BY "team_id" ORDER BY "rank", "id") AS position
	FROM "issue"
)
UPDATE "issue" AS i
SET "rank" = '0|' || lpad(to_hex((o.position * 2 + 1)::bigint), 8, '0')
FROM ordered AS o
WHERE i."id" = o."id";--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "import_job" ADD CONSTRAINT "import_job_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "import_job" ADD CONSTRAINT "import_job_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_job_owner" ON "import_job" USING btree ("owner_id","created_at");--> statement-breakpoint
-- #35: mantém o cycle current mais recente por time e encerra os duplicados antes do
-- índice único parcial. Nenhum cycle é apagado.
WITH ranked_current AS (
	SELECT "id", row_number() OVER (
		PARTITION BY "team_id"
		ORDER BY "start_date" DESC NULLS LAST, "end_date" DESC NULLS LAST, "number" DESC, "id" DESC
	) AS rn
	FROM "cycle"
	WHERE "status" = 'current'
)
UPDATE "cycle" SET "status" = 'completed'
WHERE "id" IN (SELECT "id" FROM ranked_current WHERE rn > 1);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cycle_team_current_unique" ON "cycle" USING btree ("team_id") WHERE "cycle"."status" = 'current';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_review_created_at" ON "review" USING btree ("created_at");