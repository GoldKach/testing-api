/**
 * logRetentionJob.ts
 *
 * Scheduled job that enforces regulatory log retention periods.
 *
 * RETENTION POLICY
 * ────────────────
 * AuditLog            7 years   (auth events, KYC, admin actions)
 * SecurityLog         7 years   (brute force, invalid tokens, lockouts)
 * ApiLog              1 year    (HTTP request log)
 * SystemLog           1 year    (server lifecycle, cron, backups)
 * ActivityLog         2 years   (legacy lightweight log)
 * TransactionAuditLog NEVER     (immutable SHA-256 chain — not touched)
 *
 * SCHEDULE
 * ────────
 * Runs daily at 03:00 AM server time.
 * Each table is purged in its own try/catch so one failure
 * does not prevent the others from running.
 *
 * COMPLIANCE NOTE
 * ───────────────
 * The cleanup itself is logged to SystemLog so auditors can verify
 * that retention is actively enforced and confirm which records were removed.
 */

import cron from "node-cron";
import { db } from "@/db/db";
import { auditService } from "@/audit/auditService";

// Days → milliseconds helper
const days = (n: number) => n * 24 * 60 * 60 * 1000;

const RETENTION_MS = {
  auditLog:    days(7 * 365),  // 7 years
  securityLog: days(7 * 365),  // 7 years
  apiLog:      days(365),      // 1 year
  systemLog:   days(365),      // 1 year
  activityLog: days(2 * 365),  // 2 years
} as const;

async function runRetentionCleanup(): Promise<void> {
  const startedAt = new Date();
  const summary: Record<string, number> = {};

  auditService.logSystem({
    eventType: "CRON_JOB_STARTED",
    component: "cron-job:log-retention",
    severity:  "LOW",
    message:   "Log retention cleanup started",
    metadata:  { startedAt: startedAt.toISOString() },
  });

  // ── AuditLog ────────────────────────────────────────────────────────────────
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS.auditLog);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (db as any).auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    summary.auditLog = count;
  } catch (err) {
    console.error("[logRetention] auditLog cleanup failed:", err);
    summary.auditLog = -1;
  }

  // ── SecurityLog ─────────────────────────────────────────────────────────────
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS.securityLog);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (db as any).securityLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    summary.securityLog = count;
  } catch (err) {
    console.error("[logRetention] securityLog cleanup failed:", err);
    summary.securityLog = -1;
  }

  // ── ApiLog ──────────────────────────────────────────────────────────────────
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS.apiLog);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (db as any).apiLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    summary.apiLog = count;
  } catch (err) {
    console.error("[logRetention] apiLog cleanup failed:", err);
    summary.apiLog = -1;
  }

  // ── SystemLog ───────────────────────────────────────────────────────────────
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS.systemLog);
    // Exclude the entry we're about to write (cutoff is before 'now')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (db as any).systemLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    summary.systemLog = count;
  } catch (err) {
    console.error("[logRetention] systemLog cleanup failed:", err);
    summary.systemLog = -1;
  }

  // ── ActivityLog (legacy) ────────────────────────────────────────────────────
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS.activityLog);
    const { count } = await db.activityLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    summary.activityLog = count;
  } catch (err) {
    console.error("[logRetention] activityLog cleanup failed:", err);
    summary.activityLog = -1;
  }

  const durationMs = Date.now() - startedAt.getTime();
  const hasError   = Object.values(summary).some((v) => v < 0);

  auditService.logSystem({
    eventType: hasError ? "CRON_JOB_FAILED" : "CRON_JOB_COMPLETED",
    component: "cron-job:log-retention",
    severity:  hasError ? "HIGH" : "LOW",
    message:   hasError
      ? "Log retention cleanup completed with errors"
      : "Log retention cleanup completed successfully",
    metadata: { summary, durationMs, retentionDays: {
      auditLog: RETENTION_MS.auditLog / days(1),
      securityLog: RETENTION_MS.securityLog / days(1),
      apiLog: RETENTION_MS.apiLog / days(1),
      systemLog: RETENTION_MS.systemLog / days(1),
      activityLog: RETENTION_MS.activityLog / days(1),
    }},
  });

  console.log(
    `[logRetention] completed in ${durationMs}ms:`,
    JSON.stringify(summary)
  );
}

/**
 * Start the retention cron.
 * Called once from src/index.ts after the server starts.
 */
export function startLogRetentionJob(): void {
  // Run at 03:00 AM every day
  cron.schedule("0 3 * * *", async () => {
    try {
      await runRetentionCleanup();
    } catch (err) {
      console.error("[logRetention] unexpected error:", err);
    }
  });

  console.log("[logRetention] Retention job scheduled — runs daily at 03:00 AM");
}

/**
 * Run retention cleanup immediately (for testing or manual admin trigger).
 */
export { runRetentionCleanup };
