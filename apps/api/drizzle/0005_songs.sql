CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"standard_duration" integer,
	"own_duration" integer,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_durations_positive" CHECK ("songs"."standard_duration" >= 0 and "songs"."own_duration" >= 0)
);
--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "songs_band_id_index" ON "songs" USING btree ("band_id");