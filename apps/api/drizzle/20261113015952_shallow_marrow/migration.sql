CREATE TYPE "batch_status" AS ENUM('in_stock', 'near_expiry', 'sold_out', 'expired');--> statement-breakpoint
CREATE TYPE "complaint_resolution" AS ENUM('refund', 'replacement');--> statement-breakpoint
CREATE TYPE "complaint_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "delivery_day" AS ENUM('tuesday', 'friday', 'both');--> statement-breakpoint
CREATE TYPE "farming_action_type" AS ENUM('seeding', 'watering', 'bio_fertilizing', 'weeding', 'pest_control', 'soil_testing', 'harvesting', 'correction');--> statement-breakpoint
CREATE TYPE "order_status" AS ENUM('pending_payment', 'pending_confirmation', 'packing', 'shipping', 'delivered', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "payment_method" AS ENUM('cod', 'payos', 'subscription');--> statement-breakpoint
CREATE TYPE "payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "payment_transaction_type" AS ENUM('payment', 'refund');--> statement-breakpoint
CREATE TYPE "season_status" AS ENUM('planning', 'active', 'harvested', 'completed');--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('guest', 'customer', 'farm_staff', 'sales', 'admin', 'super_admin');--> statement-breakpoint
CREATE TYPE "user_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "waste_log_status" AS ENUM('pending_approval', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"device_name" varchar(255),
	"ip_address" varchar(45),
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"receiver_name" varchar(255) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"street_address" text NOT NULL,
	"district" varchar(100) NOT NULL,
	"city" varchar(100) DEFAULT 'TP. Hồ Chí Minh' NOT NULL,
	"latitude" numeric(10,8),
	"longitude" numeric(11,8),
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20),
	"password" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'customer'::"user_role" NOT NULL,
	"reward_points" integer DEFAULT 0 NOT NULL,
	"status" "user_status" DEFAULT 'active'::"user_status" NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"verification_token" varchar(255),
	"verification_expires_at" timestamp with time zone,
	"reset_password_token" varchar(255),
	"reset_password_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "farming_logs" (
	"id" uuid PRIMARY KEY,
	"season_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"action_type" "farming_action_type" NOT NULL,
	"description" text NOT NULL,
	"media_urls" jsonb,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farms" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(255) DEFAULT 'GreenRoots Farm' NOT NULL,
	"legal_name" varchar(255) DEFAULT 'Công ty TNHH Nông nghiệp Hữu cơ GreenRoots' NOT NULL,
	"tagline" varchar(255),
	"tax_id" varchar(50),
	"address" text NOT NULL,
	"latitude" numeric(10,8) NOT NULL,
	"longitude" numeric(11,8) NOT NULL,
	"certification_url" text,
	"hotlines" jsonb NOT NULL,
	"emails" jsonb NOT NULL,
	"working_hours" jsonb NOT NULL,
	"bank_info" jsonb,
	"shipping_config" jsonb NOT NULL,
	"flash_sale_config" jsonb NOT NULL,
	"is_payos_enabled" boolean DEFAULT true NOT NULL,
	"is_cod_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plots" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"farm_id" uuid NOT NULL,
	"plot_code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"area_sqm" numeric(10,2) NOT NULL,
	"soil_test_result" jsonb,
	"water_test_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plot_id" uuid NOT NULL,
	"season_name" varchar(255) NOT NULL,
	"start_date" date NOT NULL,
	"expected_harvest_date" date NOT NULL,
	"status" "season_status" DEFAULT 'planning'::"season_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"price" integer NOT NULL,
	"total_deliveries" integer DEFAULT 8 NOT NULL,
	"weight_per_delivery_kg" numeric(5,2) DEFAULT '5.00' NOT NULL,
	"basket_description" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"customer_id" uuid NOT NULL,
	"plan_id" uuid,
	"user_address_id" uuid,
	"shipping_address" text NOT NULL,
	"shipping_distance_km" numeric(6,2) DEFAULT '0' NOT NULL,
	"shipping_fee_per_delivery" integer DEFAULT 0 NOT NULL,
	"plan_name" varchar(255) NOT NULL,
	"price" integer NOT NULL,
	"total_deliveries" integer NOT NULL,
	"weight_per_delivery_kg" numeric(5,2) NOT NULL,
	"basket_description" text NOT NULL,
	"delivery_day" "delivery_day" DEFAULT 'tuesday'::"delivery_day" NOT NULL,
	"remaining_deliveries" integer NOT NULL,
	"status" "subscription_status" DEFAULT 'active'::"subscription_status" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_code" varchar(100) NOT NULL,
	"season_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"harvest_date" date NOT NULL,
	"expiration_date" date NOT NULL,
	"initial_quantity" numeric(10,2) NOT NULL,
	"available_quantity" numeric(10,2) NOT NULL,
	"qr_code_url" text,
	"status" "batch_status" DEFAULT 'in_stock'::"batch_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"category_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"base_price" integer NOT NULL,
	"unit" varchar(50) DEFAULT 'kg' NOT NULL,
	"image_urls" jsonb,
	"is_subscription_eligible" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waste_logs" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"batch_id" uuid NOT NULL,
	"reported_by" uuid NOT NULL,
	"approved_by" uuid,
	"discarded_quantity" numeric(10,2) NOT NULL,
	"reason" varchar(255) NOT NULL,
	"media_urls" jsonb NOT NULL,
	"status" "waste_log_status" DEFAULT 'pending_approval'::"waste_log_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_allocations" (
	"id" uuid PRIMARY KEY,
	"order_item_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"allocated_quantity" numeric(10,2) NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(10,2) NOT NULL,
	"unit_price" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_code" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"subscription_id" uuid,
	"shipping_address" text NOT NULL,
	"shipping_distance_km" numeric(6,2) DEFAULT '0' NOT NULL,
	"shipping_fee" integer DEFAULT 0 NOT NULL,
	"subtotal" integer NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"total_amount" integer NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cod'::"payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending'::"payment_status" NOT NULL,
	"order_status" "order_status" DEFAULT 'pending_confirmation'::"order_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" uuid,
	"subscription_id" uuid,
	"amount" integer NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cod'::"payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending'::"payment_status" NOT NULL,
	"transaction_type" "payment_transaction_type" DEFAULT 'payment'::"payment_transaction_type" NOT NULL,
	"order_code" bigint,
	"reference_code" text,
	"payment_url" text,
	"raw_payload" jsonb,
	"verified_by" uuid,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"resolved_by" uuid,
	"reason" text NOT NULL,
	"proof_image_urls" jsonb NOT NULL,
	"proof_video_url" varchar(500),
	"status" "complaint_status" DEFAULT 'pending'::"complaint_status" NOT NULL,
	"resolution" "complaint_resolution"
);
--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_uidx" ON "refresh_tokens" ("token");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" ("expires_at");--> statement-breakpoint
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses" ("user_id");--> statement-breakpoint
CREATE INDEX "user_addresses_default_idx" ON "user_addresses" ("user_id","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" ("email") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" ("phone");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" ("role");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" ("status");--> statement-breakpoint
CREATE INDEX "users_verification_token_idx" ON "users" ("verification_token");--> statement-breakpoint
CREATE INDEX "users_reset_password_token_idx" ON "users" ("reset_password_token");--> statement-breakpoint
CREATE INDEX "farming_logs_season_id_logged_at_idx" ON "farming_logs" ("season_id","logged_at");--> statement-breakpoint
CREATE INDEX "farming_logs_staff_id_idx" ON "farming_logs" ("staff_id");--> statement-breakpoint
CREATE INDEX "plots_farm_id_idx" ON "plots" ("farm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plots_plot_code_uidx" ON "plots" ("plot_code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "seasons_plot_id_idx" ON "seasons" ("plot_id");--> statement-breakpoint
CREATE INDEX "seasons_status_idx" ON "seasons" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_slug_uidx" ON "subscription_plans" ("slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "subscription_plans_is_active_idx" ON "subscription_plans" ("is_active");--> statement-breakpoint
CREATE INDEX "subscriptions_customer_id_idx" ON "subscriptions" ("customer_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_batch_code_uidx" ON "batches" ("batch_code");--> statement-breakpoint
CREATE INDEX "batches_product_id_idx" ON "batches" ("product_id");--> statement-breakpoint
CREATE INDEX "batches_fefo_outbound_idx" ON "batches" ("expiration_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_uidx" ON "categories" ("name") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_uidx" ON "categories" ("slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_uidx" ON "products" ("slug") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" ("category_id");--> statement-breakpoint
CREATE INDEX "waste_logs_batch_id_idx" ON "waste_logs" ("batch_id");--> statement-breakpoint
CREATE INDEX "waste_logs_status_idx" ON "waste_logs" ("status");--> statement-breakpoint
CREATE INDEX "batch_allocations_order_item_id_idx" ON "batch_allocations" ("order_item_id");--> statement-breakpoint
CREATE INDEX "batch_allocations_batch_id_idx" ON "batch_allocations" ("batch_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_id_idx" ON "order_items" ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_code_uidx" ON "orders" ("order_code");--> statement-breakpoint
CREATE INDEX "orders_customer_id_idx" ON "orders" ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_subscription_id_idx" ON "orders" ("subscription_id");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_idx" ON "orders" ("order_status","created_at");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" ("order_id");--> statement-breakpoint
CREATE INDEX "payments_subscription_id_idx" ON "payments" ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_code_uidx" ON "payments" ("order_code");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_code_uidx" ON "payments" ("reference_code");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "complaints_order_id_uidx" ON "complaints" ("order_id");--> statement-breakpoint
CREATE INDEX "complaints_customer_id_idx" ON "complaints" ("customer_id");--> statement-breakpoint
CREATE INDEX "complaints_status_idx" ON "complaints" ("status");--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "farming_logs" ADD CONSTRAINT "farming_logs_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "farming_logs" ADD CONSTRAINT "farming_logs_staff_id_users_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_farm_id_farms_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_plot_id_plots_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_users_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_address_id_user_addresses_id_fkey" FOREIGN KEY ("user_address_id") REFERENCES "user_addresses"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_season_id_seasons_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_batch_id_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_reported_by_users_id_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_approved_by_users_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "batch_allocations" ADD CONSTRAINT "batch_allocations_order_item_id_order_items_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "batch_allocations" ADD CONSTRAINT "batch_allocations_batch_id_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_users_id_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_customer_id_users_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resolved_by_users_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL;