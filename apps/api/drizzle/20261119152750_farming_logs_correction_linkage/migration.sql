ALTER TABLE "farming_logs" ADD COLUMN "corrects_log_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "farming_logs_id_season_id_uidx" ON "farming_logs" ("id","season_id");--> statement-breakpoint
CREATE INDEX "farming_logs_corrects_log_id_idx" ON "farming_logs" ("corrects_log_id") WHERE "corrects_log_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "farming_logs" ADD CONSTRAINT "farming_logs_corrects_log_same_season_fkey" FOREIGN KEY ("corrects_log_id","season_id") REFERENCES "farming_logs"("id","season_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "farming_logs" ADD CONSTRAINT "farming_logs_correction_action_chk" CHECK ("corrects_log_id" IS NULL OR "action_type" = 'correction');--> statement-breakpoint
ALTER TABLE "farming_logs" ADD CONSTRAINT "farming_logs_no_self_correction_chk" CHECK ("corrects_log_id" IS NULL OR "corrects_log_id" <> "id");