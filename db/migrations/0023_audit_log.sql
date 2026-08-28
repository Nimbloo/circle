CREATE TABLE "audit_log" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"actor_id" varchar(36),
	"action" varchar(48) NOT NULL,
	"target_type" varchar(24),
	"target_id" varchar(64),
	"meta" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_app_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_created" ON "audit_log" USING btree ("created_at");