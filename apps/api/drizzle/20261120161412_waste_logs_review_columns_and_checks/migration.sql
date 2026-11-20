ALTER TABLE "waste_logs" RENAME COLUMN "approved_by" TO "reviewed_by";--> statement-breakpoint
ALTER TABLE "waste_logs" ADD COLUMN "rejection_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "waste_logs" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "waste_logs_reported_by_idx" ON "waste_logs" ("reported_by");--> statement-breakpoint
CREATE INDEX "waste_logs_reviewed_by_idx" ON "waste_logs" ("reviewed_by");--> statement-breakpoint
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_discarded_quantity_positive" CHECK ("discarded_quantity" > 0);--> statement-breakpoint
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_review_state_consistent" CHECK ((
        ("status" = 'pending_approval' AND "reviewed_by" IS NULL AND "reviewed_at" IS NULL AND "rejection_reason" IS NULL)
        OR ("status" = 'approved' AND "reviewed_at" IS NOT NULL AND "rejection_reason" IS NULL)
        OR ("status" = 'rejected' AND "reviewed_at" IS NOT NULL AND "rejection_reason" IS NOT NULL AND length(btrim("rejection_reason")) > 0)
      ));