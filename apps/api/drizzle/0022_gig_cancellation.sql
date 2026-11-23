ALTER TABLE "gigs" ADD COLUMN "cancelled_reason" text;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "cancelled_by_id" uuid;--> statement-breakpoint
ALTER TABLE "gigs" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;