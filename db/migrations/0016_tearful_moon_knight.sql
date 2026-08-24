ALTER TABLE "cycle" ADD COLUMN "cooldown_weeks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN "snapshot_scope" integer;--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN "snapshot_started" integer;--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN "snapshot_completed" integer;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "cycles_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "cycle_duration_weeks" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "cycle_start_day" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "cycle_cooldown_weeks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "cycle_upcoming_count" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "cycle_auto_add" boolean DEFAULT true NOT NULL;