"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = void 0;
const db_1 = require("../db/db");
const BRUTE_WINDOW_MS = 15 * 60 * 1000;
const BRUTE_THRESHOLD = 5;
const _loginFailures = new Map();
class AuditService {
    logAudit(params) {
        setImmediate(() => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
            db_1.db.auditLog
                .create({
                data: {
                    eventType: params.eventType,
                    action: params.action,
                    entityType: (_a = params.entityType) !== null && _a !== void 0 ? _a : null,
                    entityId: (_b = params.entityId) !== null && _b !== void 0 ? _b : null,
                    actorId: (_c = params.actorId) !== null && _c !== void 0 ? _c : null,
                    actorType: (_d = params.actorType) !== null && _d !== void 0 ? _d : null,
                    actorRole: (_e = params.actorRole) !== null && _e !== void 0 ? _e : null,
                    actorName: (_f = params.actorName) !== null && _f !== void 0 ? _f : null,
                    actorEmail: (_g = params.actorEmail) !== null && _g !== void 0 ? _g : null,
                    ipAddress: (_h = params.ipAddress) !== null && _h !== void 0 ? _h : null,
                    userAgent: (_j = params.userAgent) !== null && _j !== void 0 ? _j : null,
                    requestId: (_k = params.requestId) !== null && _k !== void 0 ? _k : null,
                    oldValues: (_l = params.oldValues) !== null && _l !== void 0 ? _l : undefined,
                    newValues: (_m = params.newValues) !== null && _m !== void 0 ? _m : undefined,
                    status: (_o = params.status) !== null && _o !== void 0 ? _o : "SUCCESS",
                    errorMessage: (_p = params.errorMessage) !== null && _p !== void 0 ? _p : null,
                    metadata: (_q = params.metadata) !== null && _q !== void 0 ? _q : undefined,
                    transactionAuditId: (_r = params.transactionAuditId) !== null && _r !== void 0 ? _r : null,
                },
            })
                .catch((err) => console.error("[AuditService] logAudit failed:", err.message));
        });
    }
    logSecurity(params) {
        setImmediate(() => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            db_1.db.securityLog
                .create({
                data: {
                    eventType: params.eventType,
                    riskLevel: (_a = params.riskLevel) !== null && _a !== void 0 ? _a : "LOW",
                    userId: (_b = params.userId) !== null && _b !== void 0 ? _b : null,
                    userName: (_c = params.userName) !== null && _c !== void 0 ? _c : null,
                    userEmail: (_d = params.userEmail) !== null && _d !== void 0 ? _d : null,
                    ipAddress: (_e = params.ipAddress) !== null && _e !== void 0 ? _e : null,
                    userAgent: (_f = params.userAgent) !== null && _f !== void 0 ? _f : null,
                    description: (_g = params.description) !== null && _g !== void 0 ? _g : null,
                    metadata: (_h = params.metadata) !== null && _h !== void 0 ? _h : undefined,
                },
            })
                .catch((err) => console.error("[AuditService] logSecurity failed:", err.message));
        });
    }
    logApi(params) {
        setImmediate(() => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            db_1.db.apiLog
                .create({
                data: {
                    requestId: params.requestId,
                    method: params.method,
                    endpoint: params.endpoint,
                    statusCode: (_a = params.statusCode) !== null && _a !== void 0 ? _a : null,
                    durationMs: (_b = params.durationMs) !== null && _b !== void 0 ? _b : null,
                    userId: (_c = params.userId) !== null && _c !== void 0 ? _c : null,
                    userRole: (_d = params.userRole) !== null && _d !== void 0 ? _d : null,
                    ipAddress: (_e = params.ipAddress) !== null && _e !== void 0 ? _e : null,
                    userAgent: (_f = params.userAgent) !== null && _f !== void 0 ? _f : null,
                    requestBody: (_g = params.requestBody) !== null && _g !== void 0 ? _g : undefined,
                    errorMessage: (_h = params.errorMessage) !== null && _h !== void 0 ? _h : null,
                    metadata: (_j = params.metadata) !== null && _j !== void 0 ? _j : undefined,
                },
            })
                .catch((err) => console.error("[AuditService] logApi failed:", err.message));
        });
    }
    logSystem(params) {
        setImmediate(() => {
            var _a, _b;
            db_1.db.systemLog
                .create({
                data: {
                    eventType: params.eventType,
                    component: params.component,
                    severity: (_a = params.severity) !== null && _a !== void 0 ? _a : "LOW",
                    message: params.message,
                    metadata: (_b = params.metadata) !== null && _b !== void 0 ? _b : undefined,
                },
            })
                .catch((err) => console.error("[AuditService] logSystem failed:", err.message));
        });
    }
    trackFailedLogin(params) {
        var _a, _b;
        const now = new Date();
        const rec = _loginFailures.get(params.key);
        let updated;
        if (!rec || now.getTime() - rec.firstAttempt.getTime() > BRUTE_WINDOW_MS) {
            updated = { count: 1, firstAttempt: now, lastAttempt: now };
        }
        else {
            updated = Object.assign(Object.assign({}, rec), { count: rec.count + 1, lastAttempt: now });
        }
        _loginFailures.set(params.key, updated);
        if (updated.count === BRUTE_THRESHOLD) {
            this.logSecurity({
                eventType: "BRUTE_FORCE_DETECTED",
                riskLevel: "HIGH",
                userId: params.userId,
                userEmail: params.userEmail,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                description: (_a = params.description) !== null && _a !== void 0 ? _a : `${BRUTE_THRESHOLD} failed login attempts within ${BRUTE_WINDOW_MS / 60000} minutes`,
                metadata: {
                    key: params.key,
                    count: updated.count,
                    windowMs: BRUTE_WINDOW_MS,
                    firstAttempt: updated.firstAttempt.toISOString(),
                    lastAttempt: updated.lastAttempt.toISOString(),
                },
            });
        }
        else {
            this.logSecurity({
                eventType: "LOGIN_FAILED",
                riskLevel: updated.count >= 3 ? "MEDIUM" : "LOW",
                userId: params.userId,
                userEmail: params.userEmail,
                ipAddress: params.ipAddress,
                userAgent: params.userAgent,
                description: (_b = params.description) !== null && _b !== void 0 ? _b : "Failed login attempt",
                metadata: { attemptCount: updated.count, key: params.key },
            });
        }
        return updated.count;
    }
    clearFailedLogins(key) {
        _loginFailures.delete(key);
    }
}
exports.auditService = new AuditService();
