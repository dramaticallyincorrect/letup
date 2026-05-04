-- Rename widget_status enum to app_status if not yet renamed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'widget_status' AND typnamespace = 'public'::regnamespace)
  AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_status' AND typnamespace = 'public'::regnamespace) THEN
    ALTER TYPE "public"."widget_status" RENAME TO "app_status";
  END IF;
END $$;--> statement-breakpoint

-- Create app_status enum if it doesn't exist at all yet
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE "public"."app_status" AS ENUM('draft', 'published');
  END IF;
END $$;--> statement-breakpoint

-- Rename widgets table to apps if not yet renamed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'widgets' AND table_schema = 'public')
  AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'apps' AND table_schema = 'public') THEN
    ALTER TABLE "public"."widgets" RENAME TO "apps";
  END IF;
END $$;--> statement-breakpoint

-- Backfill db_schema column if missing (was added to schema.ts without a migration)
ALTER TABLE "apps" ADD COLUMN IF NOT EXISTS "db_schema" text;--> statement-breakpoint

-- Create users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "handle" text NOT NULL,
  "display_name" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_handle_unique" UNIQUE("handle")
);--> statement-breakpoint

-- Add creator_id and latest_version_number to apps
ALTER TABLE "apps" ADD COLUMN IF NOT EXISTS "creator_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN IF NOT EXISTS "latest_version_number" integer NOT NULL DEFAULT 0;--> statement-breakpoint

-- Create app_versions table
CREATE TABLE IF NOT EXISTS "app_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "app_id" uuid NOT NULL REFERENCES "apps"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "compiled_code" text,
  "css_code" text,
  "source_files" jsonb DEFAULT '[]'::jsonb,
  "db_schema" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "app_versions_app_id_version_number_unique" UNIQUE("app_id", "version_number")
);--> statement-breakpoint

-- Create user_app_installs table
CREATE TABLE IF NOT EXISTS "user_app_installs" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "app_versions"("id") ON DELETE CASCADE,
  "installed_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_app_installs_pkey" PRIMARY KEY("user_id", "version_id")
);
