CREATE TYPE "public"."subscription" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan" "subscription" DEFAULT 'free' NOT NULL,
	"paddle_customer_id" text,
	"paddle_subscription_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;