CREATE TYPE "public"."song_status" AS ENUM('proposed', 'learning', 'ready');--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "status" "song_status" DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "energy" smallint;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_energy_range" CHECK ("songs"."energy" between 1 and 3);