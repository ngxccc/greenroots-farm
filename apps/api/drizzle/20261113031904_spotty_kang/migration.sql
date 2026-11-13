ALTER TABLE "batches" ADD CONSTRAINT "batches_initial_quantity_non_negative" CHECK ("initial_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_available_quantity_non_negative" CHECK ("available_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_base_price_non_negative" CHECK ("base_price" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_fee_non_negative" CHECK ("shipping_fee" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_subtotal_non_negative" CHECK ("subtotal" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_amount_non_negative" CHECK ("discount_amount" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_amount_non_negative" CHECK ("total_amount" >= 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_or_subscription_required" CHECK ("order_id" IS NOT NULL OR "subscription_id" IS NOT NULL);