CREATE TABLE "document" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"title" varchar(512) DEFAULT 'Untitled document' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_by_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_created_by_id_app_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;