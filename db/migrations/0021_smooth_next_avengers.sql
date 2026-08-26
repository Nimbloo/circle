CREATE TABLE "attachment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"uploader_id" varchar(36),
	"name" varchar(512) NOT NULL,
	"content_type" varchar(128) NOT NULL,
	"size" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploader_id_app_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attachment_issue" ON "attachment" USING btree ("issue_id");