-- F5a: rank sem limite artificial, um ciclo current por time e índices de review.
ALTER TABLE "issue" ALTER COLUMN "rank" TYPE text USING "rank"::text;
--> statement-breakpoint

-- Converte os ranks existentes para a mesma sequência curta usada pelo rebalanceamento
-- da aplicação. A ordenação LexoRank é preservada por time; nenhuma issue é descartada.
WITH ordered AS (
   SELECT
      "id",
      row_number() OVER (PARTITION BY "team_id" ORDER BY "rank", "id") AS position
   FROM "issue"
), normalized AS (
   SELECT "id", '0|' || lpad(to_hex((position * 2 + 1)::bigint), 8, '0') AS "rank"
   FROM ordered
)
UPDATE "issue" AS i
SET "rank" = n."rank"
FROM normalized AS n
WHERE i."id" = n."id";
--> statement-breakpoint

-- Mantém o ciclo current mais recente e encerra duplicidades históricas antes da
-- constraint parcial. Nenhum ciclo é apagado.
WITH ranked_current AS (
   SELECT
      "id",
      row_number() OVER (
         PARTITION BY "team_id"
         ORDER BY "start_date" DESC NULLS LAST, "end_date" DESC NULLS LAST, "number" DESC, "id" DESC
      ) AS row_number
   FROM "cycle"
   WHERE "status" = 'current'
)
UPDATE "cycle"
SET "status" = 'completed'
WHERE "id" IN (
   SELECT "id"
   FROM ranked_current
   WHERE row_number > 1
);
--> statement-breakpoint

CREATE UNIQUE INDEX "cycle_team_current_unique"
   ON "cycle" USING btree ("team_id")
   WHERE "status" = 'current';
--> statement-breakpoint

CREATE INDEX "idx_review_created_at" ON "review" USING btree ("created_at");
