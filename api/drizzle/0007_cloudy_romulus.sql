ALTER TABLE "user_app_installs" DROP CONSTRAINT "user_app_installs_pkey";--> statement-breakpoint
ALTER TABLE "user_app_installs" ADD CONSTRAINT "user_app_installs_user_id_version_id_pk" PRIMARY KEY("user_id","version_id");--> statement-breakpoint
ALTER TABLE "app_versions" ADD COLUMN "is_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "source_code";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "compiled_code";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "css_code";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "source_files";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "db_schema";