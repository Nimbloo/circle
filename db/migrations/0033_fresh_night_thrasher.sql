CREATE TABLE "initiative_label" (
	"initiative_id" varchar(36) NOT NULL,
	"label_id" varchar(64) NOT NULL,
	CONSTRAINT "initiative_label_initiative_id_label_id_pk" PRIMARY KEY("initiative_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "initiative" ALTER COLUMN "icon" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "initiative" ADD COLUMN "icon_color" varchar(32);--> statement-breakpoint
ALTER TABLE "initiative_label" ADD CONSTRAINT "initiative_label_initiative_id_initiative_id_fk" FOREIGN KEY ("initiative_id") REFERENCES "public"."initiative"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "initiative_label" ADD CONSTRAINT "initiative_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE no action ON UPDATE no action;