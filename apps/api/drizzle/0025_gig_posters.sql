CREATE TABLE "gig_posters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"gig_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_type" text NOT NULL,
	"extension" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gig_posters" ADD CONSTRAINT "gig_posters_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_posters" ADD CONSTRAINT "gig_posters_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_posters" ADD CONSTRAINT "gig_posters_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gig_posters_gig_id_index" ON "gig_posters" USING btree ("gig_id");--> statement-breakpoint
CREATE INDEX "gig_posters_band_id_index" ON "gig_posters" USING btree ("band_id");