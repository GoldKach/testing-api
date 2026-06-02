/**
 * auditService.ts
 *
 * Central audit logging service for the Goldkach fintech platform.
 *
 * DESIGN CONTRACT
 * ───────────────
 * • Every public method is FIRE-AND-FORGET: it schedules the DB write via
 *   setImmediate() and returns void. It will NEVER throw into the caller or
 *   slow down the main request path.
 * • Failures are written to console.error only — they do not surface to clients.
 * • All timestamps are UTC (Node.js Date is always UTC internally).
 * • Sensitive fields (passwords, tokens, OTPs) must never reach these methods;
 *   callers and the API middleware are responsible for masking before calling.
 *
 * REGULATORY NOTE
 * ───────────────
 * AuditLog    — 7-year retention  (auth events, KYC, admin actions)
 * SecurityLog — 7-year retention  (brute force, invalid tokens, lockouts)
 * ApiLog      — 1-year  retention (HTTP request logging)
 * SystemLog   — 1-year  retention (server lifecycle, cron, backups)
 * TransactionAuditLog — 10 years (existing SHA-256 chain — untouched here)
 */

import { db } from "@/db/db";

// ─── Local type mirrors (schema enums) ────────────────────────────────────────
// Defined locally so the service compiles before/without `prisma generate`.

export type AuditEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "ACCOUNT_LOCKED"
  | "TOKEN_REFRESHED"
  | "TOKEN_REVOKED"
  | "EMAIL_VERIFIED"
  | "PROFILE_UPDATED"
  | "EMAIL_CHANGED"
  | "PHONE_CHANGED"
  | "SETTINGS_UPDATED"
  | "KYC_SUBMITTED"
  | "KYC_APPROVED"
  | "KYC_REJECTED"
  | "KYC_UPDATED"
  | "DOCUMENT_UPLOADED"
  | "BENEFICIARY_ADDED"
  | "BENEFICIARY_UPDATED"
  | "BENEFICIARY_REMOVED"
  | "NEXT_OF_KIN_ADDED"
  | "NEXT_OF_KIN_UPDATED"
  | "NEXT_OF_KIN_REMOVED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "ROLE_CHANGED"
  | "STATUS_CHANGED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_REACTIVATED"
  | "ACCOUNT_BANNED"
  | "STAFF_CREATED"
  | "STAFF_UPDATED"
  | "AGENT_ASSIGNED"
  | "AGENT_UNASSIGNED"
  | "DEPOSIT_INITIATED"
  | "DEPOSIT_APPROVED"
  | "DEPOSIT_REJECTED"
  | "DEPOSIT_REVERSED"
  | "WITHDRAWAL_REQUESTED"
  | "WITHDRAWAL_APPROVED"
  | "WITHDRAWAL_REJECTED"
  | "PORTFOLIO_ALLOCATED"
  | "FEE_DEDUCTED"
  | "DATA_EXPORTED"
  | "REPORT_GENERATED"
  | "CONFIGURATION_CHANGED";

export type SecurityEventType =
  | "LOGIN_FAILED"
  | "BRUTE_FORCE_DETECTED"
  | "ACCOUNT_LOCKED"
  | "UNAUTHORIZED_ACCESS"
  | "INVALID_TOKEN"
  | "TOKEN_MISUSE"
  | "SUSPICIOUS_ACTIVITY"
  | "PRIVILEGE_ESCALATION_ATTEMPT"
  | "RATE_LIMIT_EXCEEDED"
  | "RECAPTCHA_FAILED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type SystemEventType =
  | "SERVER_STARTED"
  | "SERVER_STOPPED"
  | "SERVER_ERROR"
  | "CRON_JOB_STARTED"
  | "CRON_JOB_COMPLETED"
  | "CRON_JOB_FAILED"
  | "BACKUP_COMPLETED"
  | "BACKUP_FAILED"
  | "DATABASE_MIGRATION"
  | "DEPLOYMENT_COMPLETED";

// ─── Parameter interfaces ─────────────────────────────────────────────────────

export interface LogAuditParams {
  eventType: AuditEventType;
  action: string;                        // "Approved deposit of $5,000 for Jane Doe"
  entityType?: string;                   // "Deposit" | "User" | "IndividualOnboarding" …
  entityId?: string;
  actorId?: string;
  actorType?: "ADMIN" | "STAFF" | "CLIENT" | "SYSTEM";
  actorRole?: string;
  actorName?: string;
  actorEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  oldValues?: Record<string, unknown>;   // state before the change
  newValues?: Record<string, unknown>;   // state after the change
  status?: "SUCCESS" | "FAILURE" | "PARTIAL";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  transactionAuditId?: string;
}

export interface LogSecurityParams {
  eventType: SecurityEventType;
  riskLevel?: RiskLevel;
  userId?: string;
  userName?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface LogApiParams {
  requestId: string;
  method: string;
  endpoint: string;
  statusCode?: number;
  durationMs?: number;
  userId?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  requestBody?: Record<string, unknown>;  // already masked by middleware
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface LogSystemParams {
  eventType: SystemEventType;
  component: string;      // "api-server" | "cron-job:portfolio-report" | "backup"
  severity?: RiskLevel;
  message: string;
  metadata?: Record<string, unknown>;
}

// ─── Brute-force / failed-login tracking (in-memory) ─────────────────────────
// Resets on server restart; sufficient for a single-VPS deployment.
// For multi-instance deployments replace with Redis.

interface AttemptRecord {
  count: number;
  firstAttempt: Date;
  lastAttempt: Date;
}

const BRUTE_WINDOW_MS  = 15 * 60 * 1000; // 15-minute rolling window
const BRUTE_THRESHOLD  = 5;              // attempts before logging HIGH-risk event

const _loginFailures = new Map<string, AttemptRecord>();

// ─── AuditService class ───────────────────────────────────────────────────────

class AuditService {

  // ── General / compliance audit log ──────────────────────────────────────────

  logAudit(params: LogAuditParams): void {
    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).auditLog
        .create({
          data: {
            eventType:          params.eventType,
            action:             params.action,
            entityType:         params.entityType  ?? null,
            entityId:           params.entityId    ?? null,
            actorId:            params.actorId     ?? null,
            actorType:          params.actorType   ?? null,
            actorRole:          params.actorRole   ?? null,
            actorName:          params.actorName   ?? null,
            actorEmail:         params.actorEmail  ?? null,
            ipAddress:          params.ipAddress   ?? null,
            userAgent:          params.userAgent   ?? null,
            requestId:          params.requestId   ?? null,
            oldValues:          params.oldValues   ?? undefined,
            newValues:          params.newValues   ?? undefined,
            status:             params.status      ?? "SUCCESS",
            errorMessage:       params.errorMessage ?? null,
            metadata:           params.metadata    ?? undefined,
            transactionAuditId: params.transactionAuditId ?? null,
          },
        })
        .catch((err: Error) =>
          console.error("[AuditService] logAudit failed:", err.message)
        );
    });
  }

  // ── Security event log ───────────────────────────────────────────────────────

  logSecurity(params: LogSecurityParams): void {
    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).securityLog
        .create({
          data: {
            eventType:   params.eventType,
            riskLevel:   params.riskLevel   ?? "LOW",
            userId:      params.userId      ?? null,
            userName:    params.userName    ?? null,
            userEmail:   params.userEmail   ?? null,
            ipAddress:   params.ipAddress   ?? null,
            userAgent:   params.userAgent   ?? null,
            description: params.description ?? null,
            metadata:    params.metadata    ?? undefined,
          },
        })
        .catch((err: Error) =>
          console.error("[AuditService] logSecurity failed:", err.message)
        );
    });
  }

  // ── API request log ──────────────────────────────────────────────────────────

  logApi(params: LogApiParams): void {
    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).apiLog
        .create({
          data: {
            requestId:    params.requestId,
            method:       params.method,
            endpoint:     params.endpoint,
            statusCode:   params.statusCode   ?? null,
            durationMs:   params.durationMs   ?? null,
            userId:       params.userId       ?? null,
            userRole:     params.userRole     ?? null,
            ipAddress:    params.ipAddress    ?? null,
            userAgent:    params.userAgent    ?? null,
            requestBody:  params.requestBody  ?? undefined,
            errorMessage: params.errorMessage ?? null,
            metadata:     params.metadata     ?? undefined,
          },
        })
        .catch((err: Error) =>
          console.error("[AuditService] logApi failed:", err.message)
        );
    });
  }

  // ── System event log ─────────────────────────────────────────────────────────

  logSystem(params: LogSystemParams): void {
    setImmediate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).systemLog
        .create({
          data: {
            eventType: params.eventType,
            component: params.component,
            severity:  params.severity ?? "LOW",
            message:   params.message,
            metadata:  params.metadata ?? undefined,
          },
        })
        .catch((err: Error) =>
          console.error("[AuditService] logSystem failed:", err.message)
        );
    });
  }

  // ── Brute-force / failed login tracking ──────────────────────────────────────
  // Call this on every failed login attempt. Returns the current attempt count.
  // Emits a HIGH-risk SecurityLog when the threshold is crossed.

  trackFailedLogin(params: {
    key: string;         // IP address or email — caller decides the key
    ipAddress?: string;
    userAgent?: string;
    userId?: string;
    userEmail?: string;
    description?: string;
  }): number {
    const now  = new Date();
    const rec  = _loginFailures.get(params.key);

    let updated: AttemptRecord;

    if (!rec || now.getTime() - rec.firstAttempt.getTime() > BRUTE_WINDOW_MS) {
      // No record yet, or window has expired — start fresh
      updated = { count: 1, firstAttempt: now, lastAttempt: now };
    } else {
      updated = { ...rec, count: rec.count + 1, lastAttempt: now };
    }

    _loginFailures.set(params.key, updated);

    if (updated.count === BRUTE_THRESHOLD) {
      // Crossed the threshold — log a brute-force event
      this.logSecurity({
        eventType:   "BRUTE_FORCE_DETECTED",
        riskLevel:   "HIGH",
        userId:      params.userId,
        userEmail:   params.userEmail,
        ipAddress:   params.ipAddress,
        userAgent:   params.userAgent,
        description: params.description
          ?? `${BRUTE_THRESHOLD} failed login attempts within ${BRUTE_WINDOW_MS / 60_000} minutes`,
        metadata: {
          key:          params.key,
          count:        updated.count,
          windowMs:     BRUTE_WINDOW_MS,
          firstAttempt: updated.firstAttempt.toISOString(),
          lastAttempt:  updated.lastAttempt.toISOString(),
        },
      });
    } else {
      // Log every individual failure as a LOW/MEDIUM event
      this.logSecurity({
        eventType:   "LOGIN_FAILED",
        riskLevel:   updated.count >= 3 ? "MEDIUM" : "LOW",
        userId:      params.userId,
        userEmail:   params.userEmail,
        ipAddress:   params.ipAddress,
        userAgent:   params.userAgent,
        description: params.description ?? "Failed login attempt",
        metadata:    { attemptCount: updated.count, key: params.key },
      });
    }

    return updated.count;
  }

  // Clear the failure record after a successful login
  clearFailedLogins(key: string): void {
    _loginFailures.delete(key);
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const auditService = new AuditService();
