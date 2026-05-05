CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected');
--> statement-breakpoint
CREATE TABLE "marketplace_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_submissions_app_id_unique" UNIQUE("app_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "marketplace_listings_app_id_unique" UNIQUE("app_id")
);
--> statement-breakpoint
ALTER TABLE "marketplace_submissions" ADD CONSTRAINT "marketplace_submissions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketplace_submissions" ADD CONSTRAINT "marketplace_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
