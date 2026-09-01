CREATE TABLE "invite" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"token" varchar(64) NOT NULL,
	"invited_by_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	CONSTRAINT "invite_email_unique" UNIQUE("email"),
	CONSTRAINT "invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_id_app_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invite_token" ON "invite" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_invite_email" ON "invite" USING btree ("email");