ALTER TABLE "ai_usage_logs"
  ADD COLUMN "app_version_id" uuid REFERENCES "app_versions"("id") ON DELETE SET NULL,
  ADD COLUMN "user_message" text,
  ADD COLUMN "build_session_id" uuid;
