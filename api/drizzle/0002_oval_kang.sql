CREATE TABLE "app_conversations" (
	"user_id" text NOT NULL,
	"app_id" uuid NOT NULL,
	"conversation_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"display_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_conversations_user_id_app_id_pk" PRIMARY KEY("user_id","app_id")
);
--> statement-breakpoint
ALTER TABLE "app_conversations" ADD CONSTRAINT "app_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_conversations" ADD CONSTRAINT "app_conversations_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "app_conversations" ("user_id", "app_id", "conversation_history", "display_history")
  SELECT "creator_id", "id", "conversation_history", "display_history"
  FROM "apps"
  WHERE "creator_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "conversation_history";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "display_history";