DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marketplace_listings') THEN
    ALTER TABLE "marketplace_listings" ADD COLUMN IF NOT EXISTS "model" text;
  END IF;
END $$;