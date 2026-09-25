-- Chave do rastro de import passa a ser por TIME: `(source, team_id, external_id)`. A chave
-- global `(source, external_id)` fazia o re-import do mesmo arquivo em outro time alterar as
-- issues do primeiro. Aditiva e idempotente; não apaga issue (só rastro sem issue).
ALTER TABLE "issue_import" ADD COLUMN IF NOT EXISTS "team_id" varchar(16);--> statement-breakpoint
-- Rastro órfão (sem issue): não há time de onde tirar o backfill.
DELETE FROM "issue_import" ii
   WHERE NOT EXISTS (SELECT 1 FROM "issue" i WHERE i."id" = ii."issue_id");--> statement-breakpoint
UPDATE "issue_import" ii SET "team_id" = i."team_id"
   FROM "issue" i
   WHERE i."id" = ii."issue_id" AND ii."team_id" IS NULL;--> statement-breakpoint
-- Novo índice único ANTES de remover a PK antiga (a tabela nunca fica sem unicidade).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_issue_import_source_team_external" ON "issue_import" USING btree ("source","team_id","external_id");--> statement-breakpoint
ALTER TABLE "issue_import" DROP CONSTRAINT IF EXISTS "issue_import_source_external_id_pk";
