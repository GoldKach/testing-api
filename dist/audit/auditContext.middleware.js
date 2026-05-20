"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditContextMiddleware = auditContextMiddleware;
function auditContextMiddleware(req, _res, next) {
    var _a, _b;
    const forwarded = req.headers["x-forwarded-for"];
    const ip = forwarded
        ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0].trim())
        : (_a = req.socket.remoteAddress) !== null && _a !== void 0 ? _a : "unknown";
    req.auditContext = {
        ipAddress: ip,
        userAgent: (_b = req.headers["user-agent"]) !== null && _b !== void 0 ? _b : "unknown",
    };
    next();
}
