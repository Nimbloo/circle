CREATE TABLE "review_commit" (
	"review_id" varchar(128) NOT NULL,
	"sha" varchar(40) NOT NULL,
	"message" varchar(512) NOT NULL,
	"author" varchar(128),
	"committed_at" timestamp,
	CONSTRAINT "review_commit_review_id_sha_pk" PRIMARY KEY("review_id","sha")
);
--> statement-breakpoint
CREATE TABLE "review_file" (
	"review_id" varchar(128) NOT NULL,
	"path" varchar(512) NOT NULL,
	"status" varchar(16) NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"patch" text,
	CONSTRAINT "review_file_review_id_path_pk" PRIMARY KEY("review_id","path")
);
--> statement-breakpoint
ALTER TABLE "review_commit" ADD CONSTRAINT "review_commit_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_file" ADD CONSTRAINT "review_file_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE cascade ON UPDATE no action;