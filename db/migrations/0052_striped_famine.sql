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
-- do índice único, sem apagar nada. A 1ª ocorrência (menor id) fica com o nome original;
-- cada outra ganha o menor sufixo ' (n)' ainda livre (um 'X (2)' pré-existente não
-- colide) e o nome base é truncado para o total caber em varchar(128).
DO $$
DECLARE
	r record;
	n int;
	suffix text;
	candidate text;
BEGIN
	FOR r IN
		SELECT "id", "name" FROM (
			SELECT "id", "name", row_number() OVER (PARTITION BY lower(trim("name")) ORDER BY "id") AS rn
			FROM "label"
		) ranked
		WHERE rn > 1
		ORDER BY "id"
	LOOP
		n := 2;
		LOOP
			suffix := ' (' || n || ')';
			candidate := left(trim(r."name"), 128 - length(suffix)) || suffix;
			EXIT WHEN NOT EXISTS (
				SELECT 1 FROM "label" WHERE lower(trim("name")) = lower(trim(candidate))
			);
			n := n + 1;
		END LOOP;
		UPDATE "label" SET "name" = candidate WHERE "id" = r."id";
	END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "label_name_lower_unique" ON "label" USING btree (lower(trim("name")));