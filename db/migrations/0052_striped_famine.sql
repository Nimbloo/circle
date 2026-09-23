CREATE TABLE "review_file_state" (
	"review_id" varchar(128) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"path" varchar(512) NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_file_state_review_id_user_id_path_pk" PRIMARY KEY("review_id","user_id","path")
);
--> statement-breakpoint
ALTER TABLE "agent_message" ADD COLUMN "error" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "review_file_state" ADD CONSTRAINT "review_file_state_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_file_state" ADD CONSTRAINT "review_file_state_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Nome de label único (case/espaço-insensitive): renomeia duplicatas existentes ANTES
-- do índice único, sem apagar nada — a 1ª ocorrência (menor id) fica com o nome
-- original, as demais ganham sufixo ' (2)', ' (3)'…
WITH ranked AS (
	SELECT "id", row_number() OVER (PARTITION BY lower(trim("name")) ORDER BY "id") AS rn
	FROM "label"
)
UPDATE "label" l
SET "name" = l."name" || ' (' || ranked.rn || ')'
FROM ranked
WHERE l."id" = ranked."id" AND ranked.rn > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "label_name_lower_unique" ON "label" USING btree (lower(trim("name")));