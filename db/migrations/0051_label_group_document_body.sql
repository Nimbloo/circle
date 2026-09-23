CREATE TABLE IF NOT EXISTS "label_group" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"color" varchar(32) DEFAULT 'gray' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_document" ADD COLUMN IF NOT EXISTS "description_doc" jsonb;--> statement-breakpoint
-- Grupos de label: cadastra os grupos que já existiam só como chave solta em
-- `label.group_id` (ex.: 'kind' do seed). Nada é apagado nem alterado nas labels.
INSERT INTO "label_group" ("id", "name", "color", "position")
SELECT g."group_id",
	CASE WHEN g."group_id" = 'kind' THEN 'Type' ELSE initcap(replace(g."group_id", '-', ' ')) END,
	'gray',
	(row_number() OVER (ORDER BY g."group_id") - 1)::integer
FROM (SELECT DISTINCT "group_id" FROM "label" WHERE "group_id" IS NOT NULL) AS g
ON CONFLICT ("id") DO NOTHING;
