-- Drop all FK constraints referencing user.id before changing column types
ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "apps" DROP CONSTRAINT "apps_creator_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_app_installs" DROP CONSTRAINT "user_app_installs_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_credits" DROP CONSTRAINT "user_credits_user_id_user_id_fk";
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_submissions') THEN
    ALTER TABLE "marketplace_submissions" DROP CONSTRAINT IF EXISTS "marketplace_submissions_submitted_by_user_id_fk";
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "account_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_user_id_user_id_fk";
--> statement-breakpoint

-- Change user.id from uuid to text (Better Auth uses its own string IDs)
ALTER TABLE "user" ALTER COLUMN "id" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint

-- Change all FK columns to text to match
ALTER TABLE "ai_usage_logs" ALTER COLUMN "user_id" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "apps" ALTER COLUMN "creator_id" SET DATA TYPE text;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_submissions') THEN
    ALTER TABLE "marketplace_submissions" ALTER COLUMN "submitted_by" SET DATA TYPE text;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "user_app_installs" ALTER COLUMN "user_id" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "user_credits" ALTER COLUMN "user_id" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "user_id" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET DATA TYPE text;
--> statement-breakpoint

-- Re-add FK constraints
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action NOT VALID;
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_creator_id_user_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
--> statement-breakpoint
ALTER TABLE "user_app_installs" ADD CONSTRAINT "user_app_installs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
--> statement-breakpoint
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_submissions')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_submissions_submitted_by_user_id_fk') THEN
    ALTER TABLE "marketplace_submissions" ADD CONSTRAINT "marketplace_submissions_submitted_by_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
