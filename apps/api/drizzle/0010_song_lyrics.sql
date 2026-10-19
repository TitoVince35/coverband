CREATE TYPE "public"."lyrics_source" AS ENUM('lrclib', 'typed');--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "lyrics" text;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "lyrics_source" "lyrics_source";--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_lyrics_source" CHECK (("songs"."lyrics" is null) = ("songs"."lyrics_source" is null));