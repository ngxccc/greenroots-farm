ALTER TABLE "products" ADD COLUMN "sale_price" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_viet_gap" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_usda" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "products_public_active_idx" ON "products" ("category_id","created_at") WHERE "deleted_at" IS NULL AND "is_active" = true;--> statement-breakpoint
CREATE INDEX "products_effective_price_idx" ON "products" (COALESCE("sale_price", "base_price")) WHERE "deleted_at" IS NULL AND "is_active" = true;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sale_price_non_negative" CHECK ("sale_price" IS NULL OR "sale_price" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_sale_price_lte_base_price" CHECK ("sale_price" IS NULL OR "sale_price" <= "base_price");