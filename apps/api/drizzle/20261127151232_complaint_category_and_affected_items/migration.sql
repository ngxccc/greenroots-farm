CREATE TYPE "complaint_category" AS ENUM('damaged_wilted', 'missing_item', 'wrong_item', 'not_fresh', 'other');--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "category" "complaint_category" DEFAULT 'other'::"complaint_category" NOT NULL;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "affected_order_item_ids" jsonb DEFAULT '[]' NOT NULL;