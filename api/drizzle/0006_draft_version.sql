ALTER TABLE "app_versions" ADD COLUMN IF NOT EXISTS "is_draft" boolean NOT NULL DEFAULT false;
