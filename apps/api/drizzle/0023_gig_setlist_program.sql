ALTER TABLE "gigs" ADD COLUMN "setlist_id" uuid;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "get_in_time" text;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "program_links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "program_notes" text;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "pay_cents" integer;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "pay_notes" text;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "shared_backline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "backline_notes" text;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "technicians_provided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gigs_setlist_id_index" ON "gigs" USING btree ("setlist_id");