"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiAuditMiddleware = apiAuditMiddleware;
const crypto_1 = __importDefault(require("crypto"));
const auditService_1 = require("../audit/auditService");
const MASKED_FIELDS = new Set([
    "password",
    "newPassword",
    "oldPassword",
    "confirmPassword",
    "currentPassword",
    "token",
    "code",
    "otp",
    "pin",
    "accessToken",
    "refreshToken",
    "secretKey",
    "apiKey",
    "secret",
    "authorization",
    "tokenHash",
    "rawToken",
]);
const MASKED_PLACEHOLDER = "***REDACTED***";
function maskSensitive(obj, depth = 0) {
    if (depth > 5 || obj === null || obj === undefined)
        return obj;
    if (typeof obj !== "object")
        return obj;
    if (Array.isArray(obj))
        return obj.map((v) => maskSensitive(v, depth + 1));
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = MASKED_FIELDS.has(key.toLowerCase())
            ? MASKED_PLACEHOLDER
            : maskSensitive(value, depth + 1);
    }
    return result;
}
const SKIP_ENDPOINTS = new Set(["/health", "/favicon.ico"]);
function apiAuditMiddleware(req, res, next) {
    if (SKIP_ENDPOINTS.has(req.path))
        return next();
    const requestId = crypto_1.default.randomUUID();
    const startTime = performance.now();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    let maskedBody;
    if (req.body &&
        typeof req.body === "object" &&
        Object.keys(req.body).length > 0) {
        maskedBody = maskSensitive(req.body);
    }
    res.on("finish", () => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const durationMs = Math.round(performance.now() - startTime);
        auditService_1.auditService.logApi({
            requestId,
            method: req.method,
            endpoint: req.path,
            statusCode: res.statusCode,
            durationMs,
            userId: (_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) !== null && _b !== void 0 ? _b : undefined,
            userRole: (_d = (_c = req.user) === null || _c === void 0 ? void 0 : _c.role) !== null && _d !== void 0 ? _d : undefined,
            ipAddress: (_e = req.auditContext) === null || _e === void 0 ? void 0 : _e.ipAddress,
            userAgent: (_f = req.auditContext) === null || _f === void 0 ? void 0 : _f.userAgent,
            requestBody: maskedBody,
            errorMessage: res.statusCode >= 500 ? `HTTP ${res.statusCode}` : undefined,
        });
        if (res.statusCode === 401 || res.statusCode === 403) {
            auditService_1.auditService.logSecurity({
                eventType: "UNAUTHORIZED_ACCESS",
                riskLevel: "MEDIUM",
                userId: (_g = req.user) === null || _g === void 0 ? void 0 : _g.userId,
                ipAddress: (_h = req.auditContext) === null || _h === void 0 ? void 0 : _h.ipAddress,
                userAgent: (_j = req.auditContext) === null || _j === void 0 ? void 0 : _j.userAgent,
                description: `${req.method} ${req.path} → ${res.statusCode}`,
                metadata: { requestId },
            });
        }
    });
    next();
}
