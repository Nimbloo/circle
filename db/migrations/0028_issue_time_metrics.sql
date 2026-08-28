ALTER TABLE "issue" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
-- Backfill best-effort p/ issues já existentes (aproximação, só p/ dar sinal imediato):
-- completed → completed_at = updated_at, started_at = created_at;
-- started   → started_at = created_at. Novas transições gravam os marcos reais.
UPDATE "issue" SET "completed_at" = "updated_at", "started_at" = "created_at"
   WHERE "status_id" IN (SELECT "id" FROM "status" WHERE "category" = 'completed')
   AND "completed_at" IS NULL;--> statement-breakpoint
UPDATE "issue" SET "started_at" = "created_at"
   WHERE "status_id" IN (SELECT "id" FROM "status" WHERE "category" = 'started')
   AND "started_at" IS NULL;
