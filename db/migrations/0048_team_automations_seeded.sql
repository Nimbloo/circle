-- Automações (#97): marca de semeadura das regras padrão. Aditiva.
--
-- `ensureDefaultAutomations` decidia por "o time tem alguma regra?", então apagar TODAS
-- as regras fazia a regra padrão ("PR merged → Done") ressuscitar na leitura seguinte —
-- não havia como desligá-la de verdade a não ser pelo toggle. Com a marca, semeia uma vez.
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "automations_seeded_at" timestamp;--> statement-breakpoint

-- Times que JÁ têm regra não são semeados de novo: marca como semeados agora para não
-- reintroduzir a regra padrão em quem a apagou antes desta migration.
UPDATE "team" SET "automations_seeded_at" = now()
 WHERE "automations_seeded_at" IS NULL
   AND EXISTS (SELECT 1 FROM "team_automation" ta WHERE ta.team_id = "team".id);
