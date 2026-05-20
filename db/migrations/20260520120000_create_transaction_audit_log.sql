-- =============================================================================
-- CMA-Compliant Transaction Audit Log
-- Supplemental SQL run AFTER Prisma migrates the TransactionAuditLog table.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Immutability trigger — prevent UPDATE or DELETE on audit rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION transaction_audit_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Audit log rows are immutable: % on transaction_audit_log is prohibited (id=%)',
    TG_OP, OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON "TransactionAuditLog";
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON "TransactionAuditLog"
  FOR EACH ROW EXECUTE FUNCTION transaction_audit_log_immutable();

DROP TRIGGER IF EXISTS trg_audit_log_no_delete ON "TransactionAuditLog";
CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON "TransactionAuditLog"
  FOR EACH ROW EXECUTE FUNCTION transaction_audit_log_immutable();

-- ---------------------------------------------------------------------------
-- 2. Database roles (run as superuser; skip if roles already exist)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_writer') THEN
    CREATE ROLE app_writer;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'compliance_reader') THEN
    CREATE ROLE compliance_reader;
  END IF;
END
$$;

-- app_writer: INSERT-only on audit log (no UPDATE/DELETE by design)
GRANT INSERT ON "TransactionAuditLog" TO app_writer;
GRANT USAGE, SELECT ON SEQUENCE "TransactionAuditLog_sequence_seq" TO app_writer;

-- compliance_reader: SELECT-only
GRANT SELECT ON "TransactionAuditLog" TO compliance_reader;

-- ---------------------------------------------------------------------------
-- 3. CMA transaction report view (Africa/Nairobi = UTC+3)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW cma_transaction_report AS
SELECT
  a.id,
  a.sequence,
  a."transactionType",
  a."transactionId",
  a."transactionStatus",
  a."userId",
  a."userName",
  a."userEmail",
  a."performedById",
  a."performedByName",
  a."performedByRole",
  a.amount,
  a.currency,
  a.description,
  a.metadata,
  a.hash,
  a."previousHash",
  a."ipAddress",
  a."systemVersion",
  -- Display timestamp in Africa/Nairobi (UTC+3)
  (a."createdAt" AT TIME ZONE 'Africa/Nairobi') AS "createdAtNairobi",
  a."createdAt"
FROM "TransactionAuditLog" a
ORDER BY a.sequence ASC;

-- Allow compliance_reader to read the view
GRANT SELECT ON cma_transaction_report TO compliance_reader;
