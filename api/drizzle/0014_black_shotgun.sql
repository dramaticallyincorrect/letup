ALTER TABLE "marketplace_listings" ADD COLUMN "app_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_submissions" ADD COLUMN "version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_submissions" ADD CONSTRAINT "marketplace_submissions_version_id_app_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."app_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_app_id_unique" UNIQUE("app_id");--> statement-breakpoint
ALTER TABLE "marketplace_submissions" ADD CONSTRAINT "marketplace_submissions_version_id_unique" UNIQUE("version_id");