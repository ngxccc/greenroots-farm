ALTER TYPE "order_status" ADD VALUE 'confirmed' BEFORE 'packing';--> statement-breakpoint
ALTER TYPE "payment_status" ADD VALUE 'cancelled' BEFORE 'refunded';--> statement-breakpoint
ALTER TABLE "batch_allocations" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_allocations_active_item_batch_uidx" ON "batch_allocations" ("order_item_id","batch_id") WHERE "released_at" IS NULL;--> statement-breakpoint
ALTER TABLE "batch_allocations" ADD CONSTRAINT "batch_allocations_quantity_positive" CHECK ("allocated_quantity" > 0);