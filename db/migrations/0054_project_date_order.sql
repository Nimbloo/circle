-- Ordem das datas do projeto (início <= alvo) garantida no banco: dois PATCHes parciais
-- concorrentes passam cada um na checagem da app e inverteriam o intervalo. Trigger, não
-- CHECK: só valida quando início ou alvo MUDAM, então projeto legado com datas invertidas
-- continua editável no resto (nome, status…) e nenhum dado existente é reescrito.
CREATE OR REPLACE FUNCTION project_date_order_check() RETURNS trigger AS $$
BEGIN
   IF NEW.start_date IS NOT NULL AND NEW.target_date IS NOT NULL
      AND NEW.start_date > NEW.target_date
      AND (TG_OP = 'INSERT'
         OR NEW.start_date IS DISTINCT FROM OLD.start_date
         OR NEW.target_date IS DISTINCT FROM OLD.target_date) THEN
      RAISE EXCEPTION 'project start_date must be on or before target_date'
         USING ERRCODE = 'check_violation', CONSTRAINT = 'project_date_order';
   END IF;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS project_date_order ON "project";--> statement-breakpoint
CREATE TRIGGER project_date_order BEFORE INSERT OR UPDATE OF start_date, target_date ON "project"
   FOR EACH ROW EXECUTE FUNCTION project_date_order_check();
