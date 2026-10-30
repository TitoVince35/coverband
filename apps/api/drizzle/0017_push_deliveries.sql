CREATE TYPE "public"."push_delivery_status" AS ENUM('sent', 'failed', 'gone');--> statement-breakpoint
CREATE TABLE "push_deliveries" (
	"notification_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"status" "push_delivery_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_deliveries_notification_id_endpoint_pk" PRIMARY KEY("notification_id","endpoint")
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;