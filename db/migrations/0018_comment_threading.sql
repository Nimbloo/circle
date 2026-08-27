ALTER TABLE "comment" ADD COLUMN "parent_id" varchar(36);--> statement-breakpoint
CREATE INDEX "idx_comment_parent" ON "comment" USING btree ("parent_id");