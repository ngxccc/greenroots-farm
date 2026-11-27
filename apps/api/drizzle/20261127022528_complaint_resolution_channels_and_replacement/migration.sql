CREATE TYPE "complaint_refund_channel" AS ENUM('bank_transfer', 'loyalty_points');--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "refund_channel" "complaint_refund_channel";--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "refund_amount_vnd" integer;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "replacement_order_id" uuid;--> statement-breakpoint
CREATE INDEX "complaints_replacement_order_id_idx" ON "complaints" ("replacement_order_id");--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_replacement_order_id_orders_id_fkey" FOREIGN KEY ("replacement_order_id") REFERENCES "orders"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_refund_amount_vnd_positive" CHECK ("refund_amount_vnd" IS NULL OR "refund_amount_vnd" > 0);