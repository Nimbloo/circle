-- Backfill idempotente: o responsável atual (issue.assignee_id) vira a única linha do
-- conjunto issue_assignee. Re-executar não duplica (PK issue_id+user_id).
INSERT INTO "issue_assignee" ("issue_id", "user_id", "created_at")
SELECT "id", "assignee_id", "created_at" FROM "issue" WHERE "assignee_id" IS NOT NULL
ON CONFLICT DO NOTHING;
