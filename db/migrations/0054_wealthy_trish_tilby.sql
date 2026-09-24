-- NOT VALID: a regra vale para toda escrita nova (insert/update), mas não varre nem
-- altera linhas legadas — nenhum dado de produção é reescrito no boot. Linha antiga com
-- intervalo invertido só precisa ser corrigida quando alguém editar as datas dela.
ALTER TABLE "project" ADD CONSTRAINT "project_date_order" CHECK ("project"."start_date" IS NULL OR "project"."target_date" IS NULL OR "project"."start_date" <= "project"."target_date") NOT VALID;
