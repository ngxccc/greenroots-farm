ALTER TYPE "subscription_status" ADD VALUE IF NOT EXISTS 'pending_payment' BEFORE 'active';--> statement-breakpoint
COMMIT;--> statement-breakpoint
BEGIN;