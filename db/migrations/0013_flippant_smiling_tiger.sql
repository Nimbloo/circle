CREATE TABLE "custom_emoji" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"shortcode" varchar(64) NOT NULL,
	"s3_key" varchar(256) NOT NULL,
	"url" varchar(512) NOT NULL,
	"content_type" varchar(64) NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_emoji_shortcode_unique" UNIQUE("shortcode")
);
--> statement-breakpoint
ALTER TABLE "custom_emoji" ADD CONSTRAINT "custom_emoji_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;