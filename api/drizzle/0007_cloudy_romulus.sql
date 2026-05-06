ALTER TABLE "user_app_installs" DROP CONSTRAINT "user_app_installs_pkey";--> statement-breakpoint
ALTER TABLE "user_app_installs" ADD CONSTRAINT "user_app_installs_user_id_version_id_pk" PRIMARY KEY("user_id","version_id");--> statement-breakpoint
ALTER TABLE "app_versions" ADD COLUMN IF NOT EXISTS "is_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN IF EXISTS "source_code";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN IF EXISTS "compiled_code";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN IF EXISTS "css_code";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN IF EXISTS "source_files";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN IF EXISTS "db_schema";