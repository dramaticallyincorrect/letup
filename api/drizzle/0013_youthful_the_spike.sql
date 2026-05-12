DROP TABLE "marketplace_listings";
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_version_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "marketplace_listings_app_version_id_unique" UNIQUE("app_version_id")
);
--> statement-breakpoint
CREATE TABLE "marketplace_stats" (
	"app_id" uuid NOT NULL,
	"date" text NOT NULL,
	"installs" integer DEFAULT 0 NOT NULL,
	"rating" text,
	CONSTRAINT "marketplace_stats_app_id_date_pk" PRIMARY KEY("app_id","date")
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_app_version_id_app_versions_id_fk" FOREIGN KEY ("app_version_id") REFERENCES "public"."app_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "marketplace_stats" ADD CONSTRAINT "marketplace_stats_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;
