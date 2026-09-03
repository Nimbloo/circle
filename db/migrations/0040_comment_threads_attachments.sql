CREATE TABLE "attachment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"comment_id" varchar(36),
	"uploaded_by_id" varchar(36) NOT NULL,
	"url" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(127) NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "resolved_by_id" varchar(36);--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_id_app_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_attachment_issue" ON "attachment" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_attachment_comment" ON "attachment" USING btree ("comment_id");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_resolved_by_id_app_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;