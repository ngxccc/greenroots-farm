CREATE TYPE "staff_audit_action" AS ENUM('staff.create', 'staff.update_profile', 'staff.change_role', 'staff.change_status', 'staff.update', 'staff.reset_credentials');--> statement-breakpoint
CREATE TABLE "staff_audit_logs" (
	"id" uuid PRIMARY KEY,
	"actor_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"action" "staff_audit_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "staff_audit_logs_target_created_idx" ON "staff_audit_logs" ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_audit_logs_actor_created_idx" ON "staff_audit_logs" ("actor_id","created_at");--> statement-breakpoint
ALTER TABLE "staff_audit_logs" ADD CONSTRAINT "staff_audit_logs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "staff_audit_logs" ADD CONSTRAINT "staff_audit_logs_target_user_id_users_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;