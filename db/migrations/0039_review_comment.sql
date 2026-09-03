CREATE TABLE "review_comment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"review_id" varchar(128) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"path" varchar(512),
	"line" integer,
	"kind" varchar(16) DEFAULT 'comment' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comment" ADD CONSTRAINT "review_comment_author_id_app_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_review_comment_review" ON "review_comment" USING btree ("review_id");