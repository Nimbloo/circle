CREATE TABLE "review" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"title" varchar(512) NOT NULL,
	"status" varchar(16) NOT NULL,
	"repo" varchar(196) NOT NULL,
	"pr_number" integer NOT NULL,
	"url" varchar(512),
	"author" varchar(128),
	"target_branch" varchar(196),
	"source_branch" varchar(196),
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"resolves_identifier" varchar(32),
	"resolves_title" varchar(512),
	"checks_passed" integer DEFAULT 0 NOT NULL,
	"checks_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_review_status" ON "review" USING btree ("status");