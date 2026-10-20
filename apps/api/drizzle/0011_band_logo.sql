CREATE TYPE "public"."logo_background" AS ENUM('light', 'dark');--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "logo_thumbnail_key" text;--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "logo_background" "logo_background" DEFAULT 'light' NOT NULL;