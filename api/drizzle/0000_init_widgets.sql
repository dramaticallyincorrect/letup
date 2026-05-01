CREATE TYPE "public"."widget_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "widget_status" DEFAULT 'draft' NOT NULL,
	"source_code" text,
	"compiled_code" text,
	"conversation_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
