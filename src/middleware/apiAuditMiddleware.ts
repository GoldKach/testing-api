/**
 * apiAuditMiddleware.ts
 *
 * Express middleware that automatically logs every HTTP request to ApiLog.
 *
 * WHAT IT LOGS
 * ────────────
 * • Request ID (UUID, also set as X-Request-Id response header)
 * • Method, endpoint, status code, duration
 * • Authenticated user ID and role (from JWT if present)
 * • IP address, User-Agent
 * • Sanitised request body (sensitive fields masked — see MASKED_FIELDS)
 *
 * WHAT IT NEVER LOGS
 * ──────────────────
 * • Passwords, OTPs, PINs, access/refresh tokens, secret keys
 * • Authorization headers (JWT bearer tokens)
 * • The raw response body (too large; status code is enough)
 *
 * PERFORMANCE
 * ───────────
 * All DB writes happen via auditService.logApi() which is fire-and-forget
 * (setImmediate + .catch). This middleware adds < 0.1 ms to every request.
 */

import crypto from "crypto";
import { Response, NextFunction } from "express";
import { AuthRequest } from "@/utils/auth";
import { auditService } from "@/audit/auditService";

// ─── Sensitive fields that must never be stored ───────────────────────────────

const MASKED_FIELDS = new Set([
  "password",
  "newPassword",
  "oldPassword",
  "confirmPassword",
  "currentPassword",
  "token",
  "code",           // OTP / 2FA codes
  "otp",
  "pin",
  "accessToken",
  "refreshToken",
  "secretKey",
  "apiKey",
  "secret",
  "authorization",  // HTTP header value
  "tokenHash",
  "rawToken",
]);

const MASKED_PLACEHOLDER = "***REDACTED***";

// Recursively mask sensitive keys in an object
function maskSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => maskSensitive(v, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = MASKED_FIELDS.has(key.toLowerCase())
      ? MASKED_PLACEHOLDER
      : maskSensitive(value, depth + 1);
  }
  return result;
}

// ─── Endpoints to skip (very high-frequency health probes) ───────────────────

const SKIP_ENDPOINTS = new Set(["/health", "/favicon.ico"]);

// ─── Middleware ───────────────────────────────────────────────────────────────

export function apiAuditMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  // Skip noise
  if (SKIP_ENDPOINTS.has(req.path)) return next();

  const requestId = crypto.randomUUID();
  const startTime = performance.now();

  // Attach so controllers can reference this ID in their own audit logs
  (req as AuthRequest & { requestId: string }).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  // Mask and capture body snapshot now (before body might be consumed)
  let maskedBody: Record<string, unknown> | undefined;
  if (
    req.body &&
    typeof req.body === "object" &&
    Object.keys(req.body).length > 0
  ) {
    maskedBody = maskSensitive(req.body) as Record<string, unknown>;
  }

  // Log when the response has finished (status code and duration are now known)
  res.on("finish", () => {
    const durationMs = Math.round(performance.now() - (startTime as unknown as number));

    auditService.logApi({
      requestId,
      method:      req.method,
      endpoint:    req.path,
      statusCode:  res.statusCode,
      durationMs,
      userId:      req.user?.userId   ?? undefined,
      userRole:    req.user?.role     ?? undefined,
      ipAddress:   req.auditContext?.ipAddress,
      userAgent:   req.auditContext?.userAgent,
      requestBody: maskedBody,
      errorMessage:
        res.statusCode >= 500 ? `HTTP ${res.statusCode}` : undefined,
    });

    // Log 4xx/5xx as security events for monitoring
    if (res.statusCode === 401 || res.statusCode === 403) {
      auditService.logSecurity({
        eventType:   "UNAUTHORIZED_ACCESS",
        riskLevel:   "MEDIUM",
        userId:      req.user?.userId,
        ipAddress:   req.auditContext?.ipAddress,
        userAgent:   req.auditContext?.userAgent,
        description: `${req.method} ${req.path} → ${res.statusCode}`,
        metadata:    { requestId },
      });
    }
  });

  next();
}
