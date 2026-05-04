-- Seed a system user to own all pre-auth apps
INSERT INTO "users" ("id", "handle", "display_name")
VALUES ('00000000-0000-0000-0000-000000000001', 'system', 'Legacy Apps')
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Assign all existing apps without a creator to the system user
UPDATE "apps" SET "creator_id" = '00000000-0000-0000-0000-000000000001' WHERE "creator_id" IS NULL;
