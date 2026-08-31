CREATE TABLE "initiative_activity" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"initiative_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"text" varchar(1024) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "initiative_activity" ADD CONSTRAINT "initiative_activity_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_activity" ADD CONSTRAINT "initiative_activity_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_initiative_activity_initiative" ON "initiative_activity" USING btree ("initiative_id","created_at");