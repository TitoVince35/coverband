CREATE TABLE "setlist_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"setlist_id" uuid NOT NULL,
	"format" text NOT NULL,
	"language" text NOT NULL,
	"fingerprint" text NOT NULL,
	"file_key" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setlist_exports_setlistId_format_language_unique" UNIQUE("setlist_id","format","language")
);
--> statement-breakpoint
ALTER TABLE "setlist_exports" ADD CONSTRAINT "setlist_exports_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setlist_exports" ADD CONSTRAINT "setlist_exports_setlist_id_setlists_id_fk" FOREIGN KEY ("setlist_id") REFERENCES "public"."setlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "setlist_exports_band_id_index" ON "setlist_exports" USING btree ("band_id");