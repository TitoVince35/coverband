CREATE TYPE "public"."lyrics_source" AS ENUM('lrclib', 'typed');--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "lyrics" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "lyrics_source" "lyrics_source";