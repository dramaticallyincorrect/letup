-- Migrate code artifacts from apps into app_versions (as version 1)
-- Only for apps that actually have content (ignores empty drafts)
INSERT INTO app_versions (app_id, version_number, compiled_code, css_code, source_files, db_schema, created_at)
SELECT
  id,
  1,
  compiled_code,
  css_code,
  source_files,
  db_schema,
  updated_at
FROM apps
WHERE compiled_code IS NOT NULL
   OR (source_files IS NOT NULL AND source_files != '[]'::jsonb)
   OR db_schema IS NOT NULL
ON CONFLICT (app_id, version_number) DO NOTHING;--> statement-breakpoint

-- Set latest_version_number = 1 for those apps
UPDATE apps SET latest_version_number = 1
WHERE compiled_code IS NOT NULL
   OR (source_files IS NOT NULL AND source_files != '[]'::jsonb)
   OR db_schema IS NOT NULL;--> statement-breakpoint

-- Drop code-artifact columns from apps (now live in app_versions)
ALTER TABLE apps DROP COLUMN IF EXISTS source_code;--> statement-breakpoint
ALTER TABLE apps DROP COLUMN IF EXISTS compiled_code;--> statement-breakpoint
ALTER TABLE apps DROP COLUMN IF EXISTS css_code;--> statement-breakpoint
ALTER TABLE apps DROP COLUMN IF EXISTS source_files;--> statement-breakpoint
ALTER TABLE apps DROP COLUMN IF EXISTS db_schema;
