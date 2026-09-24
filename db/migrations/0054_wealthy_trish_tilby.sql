-- Linhas legadas com intervalo invertido (gravadas antes da checagem da app, ou por patches
-- concorrentes): zera só o início — o alvo, que é o compromisso, fica. Sem isto o ADD
-- CONSTRAINT falharia no boot.
UPDATE "project" SET "start_date" = NULL
WHERE "start_date" IS NOT NULL AND "target_date" IS NOT NULL AND "start_date" > "target_date";--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_date_order" CHECK ("project"."start_date" IS NULL OR "project"."target_date" IS NULL OR "project"."start_date" <= "project"."target_date");
