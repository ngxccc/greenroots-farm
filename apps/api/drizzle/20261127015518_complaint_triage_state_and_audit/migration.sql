ALTER TYPE "complaint_status" ADD VALUE 'triaged' BEFORE 'approved';--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "triaged_by" uuid;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "triaged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "complaints" ADD COLUMN "triage_note" text;--> statement-breakpoint
CREATE INDEX "complaints_triaged_by_idx" ON "complaints" ("triaged_by");--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_triaged_by_users_id_fkey" FOREIGN KEY ("triaged_by") REFERENCES "users"("id") ON DELETE SET NULL;