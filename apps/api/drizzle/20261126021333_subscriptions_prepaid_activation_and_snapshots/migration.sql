ALTER TABLE "subscriptions" ADD COLUMN "subscription_code" varchar(50);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "receiver_name" varchar(255);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "receiver_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "reservation_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "subscriptions" SET "subscription_code" = 'SUB-LEGACY-' || substr("id"::text, 1, 8) WHERE "subscription_code" IS NULL;--> statement-breakpoint
UPDATE "subscriptions" SET "receiver_name" = 'Legacy Receiver' WHERE "receiver_name" IS NULL;--> statement-breakpoint
UPDATE "subscriptions" SET "receiver_phone" = '0900000000' WHERE "receiver_phone" IS NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "subscription_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "receiver_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "receiver_phone" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'pending_payment'::"subscription_status";--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_subscription_code_uidx" ON "subscriptions" ("subscription_code");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_created_id_idx" ON "subscriptions" ("customer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "subscriptions_reservation_expires_at_idx" ON "subscriptions" ("reservation_expires_at") WHERE "status" = 'pending_payment' AND "reservation_expires_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_non_negative" CHECK ("price" >= 0);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_total_deliveries_positive" CHECK ("total_deliveries" > 0);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_remaining_deliveries_non_negative" CHECK ("remaining_deliveries" >= 0);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_remaining_within_total" CHECK ("remaining_deliveries" <= "total_deliveries");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_shipping_fee_non_negative" CHECK ("shipping_fee_per_delivery" >= 0);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_date_range_valid" CHECK ("end_date" >= "start_date");