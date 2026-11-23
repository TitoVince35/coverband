CREATE TYPE "public"."band_contact_type" AS ENUM('organizer', 'technical', 'musician');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "band_contact_type" NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gig_contacts" (
	"gig_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"band_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "gig_contacts_gig_id_contact_id_pk" PRIMARY KEY("gig_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "venue_contacts" (
	"venue_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"band_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "venue_contacts_venue_id_contact_id_pk" PRIMARY KEY("venue_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_contacts" ADD CONSTRAINT "gig_contacts_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "public"."gigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_contacts" ADD CONSTRAINT "gig_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gig_contacts" ADD CONSTRAINT "gig_contacts_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_contacts" ADD CONSTRAINT "venue_contacts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_contacts" ADD CONSTRAINT "venue_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_contacts" ADD CONSTRAINT "venue_contacts_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_band_id_index" ON "contacts" USING btree ("band_id");--> statement-breakpoint
CREATE INDEX "gig_contacts_contact_id_index" ON "gig_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "venue_contacts_contact_id_index" ON "venue_contacts" USING btree ("contact_id");