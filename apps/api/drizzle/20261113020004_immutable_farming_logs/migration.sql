-- Append-only guard for farming_logs (traceability integrity).
CREATE OR REPLACE FUNCTION prevent_farming_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'FARMING_LOG_IMMUTABLE: Nghiem cam UPDATE hoac DELETE nhat ky canh tac!';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_immutable_farming_logs
BEFORE UPDATE OR DELETE ON farming_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_farming_log_mutation();
