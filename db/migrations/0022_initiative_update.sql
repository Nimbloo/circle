CREATE TABLE "initiative_update" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"initiative_id" varchar(36) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"health" varchar(16) NOT NULL,
	"blocks" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "initiative_update" ADD CONSTRAINT "initiative_update_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_update" ADD CONSTRAINT "initiative_update_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_initiative_update_initiative" ON "initiative_update" USING btree ("initiative_id");