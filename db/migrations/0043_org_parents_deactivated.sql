ALTER TABLE "app_user" ADD COLUMN "deactivated_at" timestamp;--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN "parent_id" varchar(36);--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "parent_id" varchar(16);--> statement-breakpoint
ALTER TABLE "initiative" ADD CONSTRAINT "initiative_parent_id_initiative_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."initiative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_parent_id_team_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_initiative_parent" ON "initiative" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_team_parent" ON "team" USING btree ("parent_id");