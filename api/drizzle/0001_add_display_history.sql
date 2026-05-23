ALTER TABLE "apps" ADD COLUMN "display_history" jsonb NOT NULL DEFAULT '[]'::jsonb;
