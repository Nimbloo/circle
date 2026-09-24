-- Duplicatas exatas (mesma issue, relacionada e tipo) vindas de adds concorrentes: fica
-- UMA por par. A tabela não tem data de criação; o critério estável é o menor id.
DELETE FROM "issue_relation" r
USING "issue_relation" keep
WHERE r."issue_id" = keep."issue_id"
  AND r."related_id" = keep."related_id"
  AND r."kind" = keep."kind"
  AND r."id" > keep."id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "issue_relation_pair_unique" ON "issue_relation" USING btree ("issue_id","related_id","kind");
