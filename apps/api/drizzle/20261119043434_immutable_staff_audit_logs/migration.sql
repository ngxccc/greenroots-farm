-- Append-only guard for staff_audit_logs (admin audit integrity).
CREATE OR REPLACE FUNCTION prevent_staff_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'STAFF_AUDIT_LOG_IMMUTABLE: UPDATE and DELETE on staff_audit_logs are forbidden.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_immutable_staff_audit_logs
BEFORE UPDATE OR DELETE ON staff_audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_staff_audit_log_mutation();
