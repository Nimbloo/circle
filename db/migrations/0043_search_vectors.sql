-- Busca full-text (#99): colunas geradas `search_vector` + índices GIN.
-- Aditiva e idempotente (IF NOT EXISTS), sem extensão Postgres: configuração `simple`
-- (o RDS compartilhado não garante `unaccent`/`pg_trgm`).
--
-- Peso A = o que identifica a entidade (título/nome/identifier); peso B = corpo
-- (descrição/resumo). `ts_rank_cd` então ranqueia título acima de descrição sem
-- lógica extra na aplicação.
--
-- Como a descrição da issue mora em `issue_content` (e a do projeto em
-- `project_detail`), cada tabela tem o SEU vetor e a consulta faz `OR` entre os dois
-- — assim os dois índices GIN continuam utilizáveis (BitmapOr), o que uma expressão
-- combinada entre tabelas impediria.

-- ── issue: título + identifier (peso A) ─────────────────────────────
ALTER TABLE "issue" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
      setweight(to_tsvector('simple', coalesce("identifier", '')), 'A')
   ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issue_search_vector" ON "issue" USING GIN ("search_vector");
--> statement-breakpoint

-- ── issue_content: descrição (peso B) ───────────────────────────────
ALTER TABLE "issue_content" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("description", '')), 'B')
   ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_issue_content_search_vector" ON "issue_content" USING GIN ("search_vector");
--> statement-breakpoint

-- ── project: nome (peso A) ──────────────────────────────────────────
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("name", '')), 'A')
   ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_search_vector" ON "project" USING GIN ("search_vector");
--> statement-breakpoint

-- ── project_detail: resumo + descrição (peso B) ─────────────────────
ALTER TABLE "project_detail" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("summary", '')), 'B') ||
      setweight(to_tsvector('simple', coalesce("description", '')), 'B')
   ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_detail_search_vector" ON "project_detail" USING GIN ("search_vector");
--> statement-breakpoint

-- ── initiative: nome (A) + descrição (B), mesma tabela ──────────────
ALTER TABLE "initiative" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
      setweight(to_tsvector('simple', coalesce("description", '')), 'B')
   ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_initiative_search_vector" ON "initiative" USING GIN ("search_vector");
--> statement-breakpoint

-- ── team_document: nome (peso A; o corpo do documento não é persistido) ──
ALTER TABLE "team_document" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
   GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("name", '')), 'A')
   ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_document_search_vector" ON "team_document" USING GIN ("search_vector");
