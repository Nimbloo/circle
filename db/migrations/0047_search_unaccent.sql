-- Busca insensível a acento (hardening v0.29.0). Refaz as colunas geradas de
-- `0044_search_vectors` normalizando diacríticos.
--
-- `unaccent` e `pg_trgm` NÃO estão disponíveis no RDS compartilhado — a normalização é
-- por `translate()` com a tabela Latin-1, que é IMMUTABLE e por isso vale em coluna
-- gerada. A MESMA tabela vive em `lib/api/search.ts` (`ACCENTED`/`UNACCENTED`) para a
-- consulta e o fallback; `test/search-accents.test.ts` guarda as duas cópias em sincronia.
--
-- Aditiva no sentido que importa: as colunas recriadas são DERIVADAS (`GENERATED ALWAYS
-- … STORED`), nenhum dado do usuário é perdido — o Postgres as repopula na hora.

ALTER TABLE "issue" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
ALTER TABLE "issue" ADD COLUMN "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', translate(coalesce("title", ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'A') ||
      setweight(to_tsvector('simple', coalesce("identifier", '')), 'A')
   ) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issue_search_vector" ON "issue" USING GIN ("search_vector");--> statement-breakpoint

ALTER TABLE "issue_content" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
ALTER TABLE "issue_content" ADD COLUMN "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', translate(coalesce("description", ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'B')
   ) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issue_content_search_vector" ON "issue_content" USING GIN ("search_vector");--> statement-breakpoint

ALTER TABLE "project" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', translate(coalesce("name", ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'A')
   ) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_search_vector" ON "project" USING GIN ("search_vector");--> statement-breakpoint

ALTER TABLE "project_detail" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
ALTER TABLE "project_detail" ADD COLUMN "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', translate(coalesce("summary", ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'B') ||
      setweight(to_tsvector('simple', translate(coalesce("description", ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'B')
   ) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_detail_search_vector" ON "project_detail" USING GIN ("search_vector");--> statement-breakpoint

ALTER TABLE "initiative" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', translate(coalesce("name", ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'A') ||
      setweight(to_tsvector('simple', translate(coalesce("description", ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'B')
   ) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_initiative_search_vector" ON "initiative" USING GIN ("search_vector");--> statement-breakpoint

ALTER TABLE "team_document" DROP COLUMN IF EXISTS "search_vector";--> statement-breakpoint
ALTER TABLE "team_document" ADD COLUMN "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', translate(coalesce("name", ''), 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy')), 'A')
   ) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_document_search_vector" ON "team_document" USING GIN ("search_vector");
