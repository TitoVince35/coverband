CREATE TYPE "public"."document_kind" AS ENUM('photo', 'pdf', 'guitarpro', 'musescore');--> statement-breakpoint
CREATE TABLE "song_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "document_kind" NOT NULL,
	"content_type" text NOT NULL,
	"extension" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"instruments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"added_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song_documents" ADD CONSTRAINT "song_documents_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_documents" ADD CONSTRAINT "song_documents_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_documents" ADD CONSTRAINT "song_documents_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "song_documents_song_id_index" ON "song_documents" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "song_documents_band_id_index" ON "song_documents" USING btree ("band_id");