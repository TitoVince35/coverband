CREATE TYPE "public"."gig_status" AS ENUM('proposed', 'settled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."gig_type" AS ENUM('public', 'private', 'recording');--> statement-breakpoint
CREATE TABLE "gigs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"date" date NOT NULL,
	"title" text,
	"type" "gig_type" DEFAULT 'public' NOT NULL,
	"show_time" text,
	"status" "gig_status" DEFAULT 'proposed' NOT NULL,
	"venue_id" uuid,
	"created_by_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gigs_title_or_venue" CHECK ("gigs"."title" is not null or "gigs"."venue_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"address" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gigs" ADD CONSTRAINT "gigs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gigs_band_id_date_index" ON "gigs" USING btree ("band_id","date");--> statement-breakpoint
CREATE INDEX "gigs_venue_id_index" ON "gigs" USING btree ("venue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venues_band_name_city_lower_unique" ON "venues" USING btree ("band_id",lower("name"),lower("city"));