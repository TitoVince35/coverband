CREATE TABLE "setlist_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"setlist_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"name" text,
	CONSTRAINT "setlist_parts_setlistId_position_unique" UNIQUE("setlist_id","position")
);
--> statement-breakpoint
CREATE TABLE "setlist_songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"setlist_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"song_id" uuid NOT NULL,
	CONSTRAINT "setlist_songs_partId_position_unique" UNIQUE("part_id","position")
);
--> statement-breakpoint
ALTER TABLE "setlist_parts" ADD CONSTRAINT "setlist_parts_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_parts" ADD CONSTRAINT "setlist_parts_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_part_id_setlist_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."setlist_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_songs" ADD CONSTRAINT "setlist_songs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "setlist_songs_setlist_id_index" ON "setlist_songs" USING btree ("setlist_id");--> statement-breakpoint
CREATE INDEX "setlist_songs_song_id_index" ON "setlist_songs" USING btree ("song_id");--> statement-breakpoint
-- Setlists made before parts existed get their first part, unnamed.
INSERT INTO "setlist_parts" ("band_id", "setlist_id", "position") SELECT "band_id", "id", 0 FROM "setlists" WHERE NOT EXISTS (SELECT 1 FROM "setlist_parts" WHERE "setlist_parts"."setlist_id" = "setlists"."id");
