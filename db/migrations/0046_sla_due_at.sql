-- SLA com vencimento REAL (hardening v0.29.0). Aditiva: nenhuma coluna sai.
--
-- Problema medido: `due_date` é `date` e trunca a hora. Aplicados às 09:00, os SLAs de
-- 1 h, 2 h, 4 h, 8 h e 12 h caíam TODOS no mesmo fim de dia (15 h de prazo); às 22:00 um
-- SLA de 4 h virava 26 h. `sla_due_at` passa a ser a fonte da verdade do indicador —
-- `due_date` continua sendo a data humana que a UI mostra.
--
-- A trigger existe porque o vencimento precisa valer em QUALQUER caminho de escrita
-- (criação, PATCH, automação, import) e não apenas onde alguém lembrou de calcular.
-- Regra de negócio embutida: **um SLA nunca é afrouxado por troca de prioridade** —
-- vale o vencimento mais apertado entre o antigo e o novo. Sem isso, uma issue já
-- `breached` voltava a `ok` com uma troca de dropdown. A saída legítima continua sendo
-- definir um due date manual, que desliga o SLA (`sla_applied_at = NULL`).
ALTER TABLE "issue" ADD COLUMN IF NOT EXISTS "sla_due_at" timestamp;--> statement-breakpoint

-- Backfill das issues já com SLA aplicado: herdam a semântica antiga (fim do dia UTC do
-- `due_date`), então nenhum indicador muda de estado por causa da migration.
UPDATE "issue"
   SET "sla_due_at" = ("due_date"::timestamp + interval '23 hours 59 minutes 59.999 seconds')
 WHERE "sla_applied_at" IS NOT NULL AND "due_date" IS NOT NULL AND "sla_due_at" IS NULL;--> statement-breakpoint

CREATE OR REPLACE FUNCTION issue_sync_sla_due_at() RETURNS trigger AS $$
DECLARE
   contracted integer;
   computed timestamp;
BEGIN
   -- Sem SLA aplicado (due date manual ou prioridade sem SLA) não há vencimento.
   IF NEW.sla_applied_at IS NULL THEN
      NEW.sla_due_at := NULL;
      RETURN NEW;
   END IF;

   SELECT hours INTO contracted
     FROM team_sla
    WHERE team_id = NEW.team_id AND priority_id = NEW.priority_id;

   -- Prioridade sem SLA contratado: preserva o que a aplicação escreveu.
   IF contracted IS NULL THEN
      RETURN NEW;
   END IF;

   computed := NEW.sla_applied_at + make_interval(hours => contracted);

   IF TG_OP = 'UPDATE' THEN
      IF OLD.sla_due_at IS NOT NULL THEN
         computed := LEAST(OLD.sla_due_at, computed);
      END IF;
   END IF;

   NEW.sla_due_at := computed;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS "issue_sla_due_at_ins" ON "issue";--> statement-breakpoint
CREATE TRIGGER "issue_sla_due_at_ins"
   BEFORE INSERT ON "issue"
   FOR EACH ROW WHEN (NEW.sla_applied_at IS NOT NULL)
   EXECUTE FUNCTION issue_sync_sla_due_at();--> statement-breakpoint

-- No UPDATE a trigger só dispara quando algo do SLA muda — um PATCH de título não paga
-- a consulta a `team_sla`.
DROP TRIGGER IF EXISTS "issue_sla_due_at_upd" ON "issue";--> statement-breakpoint
CREATE TRIGGER "issue_sla_due_at_upd"
   BEFORE UPDATE ON "issue"
   FOR EACH ROW WHEN (
      NEW.sla_applied_at IS DISTINCT FROM OLD.sla_applied_at
      OR NEW.priority_id IS DISTINCT FROM OLD.priority_id
   )
   EXECUTE FUNCTION issue_sync_sla_due_at();
