ALTER TABLE "orders" ADD COLUMN "loyalty_points_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_reward_points_non_negative" CHECK ("reward_points" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_loyalty_points_used_non_negative" CHECK ("loyalty_points_used" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_lte_subtotal" CHECK ("discount_amount" <= "subtotal");