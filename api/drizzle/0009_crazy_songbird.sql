-- Create Better Auth tables (not previously tracked)
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Drop old FK constraints referencing users (actual constraint names in DB)
ALTER TABLE "ai_usage_logs" DROP CONSTRAINT IF EXISTS "ai_usage_logs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "user_credits" DROP CONSTRAINT IF EXISTS "user_credits_user_id_users_id_fk";
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_submissions') THEN
    ALTER TABLE "marketplace_submissions" DROP CONSTRAINT IF EXISTS "marketplace_submissions_submitted_by_users_id_fk";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "user_app_installs" DROP CONSTRAINT IF EXISTS "user_app_installs_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "apps" DROP CONSTRAINT IF EXISTS "apps_creator_id_fkey";
--> statement-breakpoint
-- Drop old users table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
    DROP TABLE "users" CASCADE;
  END IF;
END $$;
--> statement-breakpoint
-- Add missing columns to existing marketplace tables (only if tables exist — they were created manually on prod)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_listings') THEN
    ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "app_version_id" uuid;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_listings_app_version_id_unique') THEN
      ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_app_version_id_unique" UNIQUE("app_version_id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_listings_app_version_id_app_versions_id_fk') THEN
      ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_app_version_id_app_versions_id_fk" FOREIGN KEY ("app_version_id") REFERENCES "public"."app_versions"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_submissions') THEN
    ALTER TABLE "marketplace_submissions" ADD COLUMN IF NOT EXISTS "version_id" uuid;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_submissions_version_id_unique') THEN
      ALTER TABLE "marketplace_submissions" ADD CONSTRAINT "marketplace_submissions_version_id_unique" UNIQUE("version_id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_submissions_version_id_app_versions_id_fk') THEN
      ALTER TABLE "marketplace_submissions" ADD CONSTRAINT "marketplace_submissions_version_id_app_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."app_versions"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_submissions_submitted_by_user_id_fk') THEN
      ALTER TABLE "marketplace_submissions" ADD CONSTRAINT "marketplace_submissions_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action NOT VALID;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
-- Add new FK constraints pointing to user table (NOT VALID skips check on orphaned rows from old users table)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_logs_user_id_user_id_fk') THEN
    ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_usage_logs' AND column_name = 'app_version_id')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_logs_app_version_id_app_versions_id_fk') THEN
    ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_app_version_id_app_versions_id_fk" FOREIGN KEY ("app_version_id") REFERENCES "public"."app_versions"("id") ON DELETE set null ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apps_creator_id_user_id_fk') THEN
    ALTER TABLE "apps" ADD CONSTRAINT "apps_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_app_installs_user_id_user_id_fk') THEN
    ALTER TABLE "user_app_installs" ADD CONSTRAINT "user_app_installs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_credits_user_id_user_id_fk') THEN
    ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_user_id_user_id_fk') THEN
    ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_user_id_user_id_fk') THEN
    ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
--> statement-breakpoint
-- Drop apps.status column and app_status enum
ALTER TABLE "apps" DROP COLUMN "status";
--> statement-breakpoint
DROP TYPE "public"."app_status";
