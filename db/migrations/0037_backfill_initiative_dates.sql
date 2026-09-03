-- Backfill de initiative.target_date a partir do rótulo humano `target`.
-- Mesma regra de `targetDateFromLabel` (lib/initiative-period.ts):
--   Q[1-4] YYYY  → último dia do trimestre
--   H[12] YYYY   → 30/06 ou 31/12
--   YYYY         → 31/12
--   Mon YYYY / YYYY-MM → último dia do mês
--   Mon d, YYYY / YYYY-MM-DD → a própria data
-- O que não casa fica com target_date nulo (o rótulo segue como está). Sem to_date:
-- datas inválidas (ex.: 2026-02-30) viram nulo em vez de derrubar a migration.
UPDATE "initiative" AS i
SET "target_date" = parsed.target_date
FROM (
   SELECT
      id,
      CASE
         WHEN t ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$' THEN (
            SELECT CASE WHEN extract(month FROM c.d) = substr(t, 6, 2)::int THEN c.d END
            FROM (
               SELECT make_date(substr(t, 1, 4)::int, substr(t, 6, 2)::int, 1)
                  + (substr(t, 9, 2)::int - 1) AS d
            ) AS c
         )
         WHEN t ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
            (make_date(substr(t, 1, 4)::int, substr(t, 6, 2)::int, 1)
               + interval '1 month - 1 day')::date
         WHEN t ~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{4}$' THEN
            (make_date(
               right(t, 4)::int,
               (position(lower(substr(t, 1, 3)) IN 'janfebmaraprmayjunjulaugsepoctnovdec') + 2) / 3,
               1
            ) + interval '1 month - 1 day')::date
         WHEN t ~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2},? \d{4}$' THEN (
            SELECT CASE WHEN extract(month FROM c.d) = c.m THEN c.d END
            FROM (
               SELECT
                  mm.m,
                  make_date(right(t, 4)::int, mm.m, 1)
                     + (substring(t FROM '(\d{1,2}),? \d{4}$')::int - 1) AS d
               FROM (
                  SELECT (position(lower(substr(t, 1, 3)) IN 'janfebmaraprmayjunjulaugsepoctnovdec') + 2) / 3 AS m
               ) AS mm
            ) AS c
         )
         WHEN t ~* '^Q[1-4] \d{4}$' THEN
            (make_date(right(t, 4)::int, substr(t, 2, 1)::int * 3, 1)
               + interval '1 month - 1 day')::date
         WHEN t ~* '^H[12] \d{4}$' THEN
            (make_date(right(t, 4)::int, substr(t, 2, 1)::int * 6, 1)
               + interval '1 month - 1 day')::date
         WHEN t ~ '^\d{4}$' THEN make_date(t::int, 12, 31)
      END AS target_date
   FROM (SELECT id, btrim(target) AS t FROM "initiative" WHERE target IS NOT NULL) AS src
) AS parsed
WHERE i.id = parsed.id AND i.target_date IS NULL AND parsed.target_date IS NOT NULL;
