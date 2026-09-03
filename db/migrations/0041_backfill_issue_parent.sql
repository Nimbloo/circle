-- Backfill de issue.parent_id a partir da hierarquia antiga (issue_relation kind='sub':
-- issue_id = pai, related_id = filha). Idempotente: só preenche quem ainda não tem pai.
-- Em conflito (filha com mais de um pai), fica o pai MAIS ANTIGO (created_at, depois id).
-- Auto-relação (pai = filha) é ignorada. As linhas `sub` deixam de ser escritas pela app.
UPDATE "issue" AS c
SET "parent_id" = p.parent_id
FROM (
   SELECT DISTINCT ON (r.related_id) r.related_id AS child_id, r.issue_id AS parent_id
   FROM "issue_relation" AS r
   JOIN "issue" AS pi ON pi.id = r.issue_id
   WHERE r.kind = 'sub' AND r.issue_id <> r.related_id
   ORDER BY r.related_id, pi.created_at ASC, pi.id ASC
) AS p
WHERE c.id = p.child_id AND c.parent_id IS NULL;
