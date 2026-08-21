CREATE TABLE "user_avatar" (
	"user_id" varchar(36) PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"content_type" varchar(64) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_avatar" ADD CONSTRAINT "user_avatar_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;