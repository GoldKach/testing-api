"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAllSessions = listAllSessions;
exports.listUserSessions = listUserSessions;
exports.revokeSession = revokeSession;
exports.revokeAllUserSessions = revokeAllUserSessions;
exports.getSessionStats = getSessionStats;
const db_1 = require("../db/db");
const SESSION_SELECT = {
    id: true,
    createdAt: true,
    expiresAt: true,
    revoked: true,
    revokedAt: true,
    ipAddress: true,
    userAgent: true,
    location: true,
    country: true,
    city: true,
    deviceType: true,
    browser: true,
    os: true,
    user: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            status: true,
            imageUrl: true,
        },
    },
};
function isExpired(expiresAt) {
    return new Date() > expiresAt;
}
function listAllSessions(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { page = "1", pageSize = "50", userId, active, search, } = req.query;
            const take = Math.min(Number(pageSize) || 50, 200);
            const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
            const where = {};
            if (userId)
                where.userId = userId;
            if (active === "true") {
                where.revoked = false;
                where.expiresAt = { gt: new Date() };
            }
            if (search) {
                where.OR = [
                    { ipAddress: { contains: search, mode: "insensitive" } },
                    { location: { contains: search, mode: "insensitive" } },
                    { browser: { contains: search, mode: "insensitive" } },
                    { os: { contains: search, mode: "insensitive" } },
                    { user: { email: { contains: search, mode: "insensitive" } } },
                    { user: { firstName: { contains: search, mode: "insensitive" } } },
                    { user: { lastName: { contains: search, mode: "insensitive" } } },
                ];
            }
            const [total, rows] = yield Promise.all([
                db_1.db.refreshToken.count({ where }),
                db_1.db.refreshToken.findMany({
                    where,
                    select: SESSION_SELECT,
                    orderBy: { createdAt: "desc" },
                    skip,
                    take,
                }),
            ]);
            const enriched = rows.map((s) => (Object.assign(Object.assign({}, s), { isExpired: isExpired(s.expiresAt), isActive: !s.revoked && !isExpired(s.expiresAt) })));
            return res.json({
                data: { rows: enriched, total, page: Number(page), pageSize: take, totalPages: Math.ceil(total / take) },
                error: null,
            });
        }
        catch (err) {
            console.error("listAllSessions error:", err);
            return res.status(500).json({ data: null, error: "Failed to list sessions" });
        }
    });
}
function listUserSessions(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { userId } = req.params;
        try {
            const rows = yield db_1.db.refreshToken.findMany({
                where: { userId },
                select: SESSION_SELECT,
                orderBy: { createdAt: "desc" },
                take: 50,
            });
            const enriched = rows.map((s) => (Object.assign(Object.assign({}, s), { isExpired: isExpired(s.expiresAt), isActive: !s.revoked && !isExpired(s.expiresAt) })));
            return res.json({ data: enriched, error: null });
        }
        catch (err) {
            console.error("listUserSessions error:", err);
            return res.status(500).json({ data: null, error: "Failed to list user sessions" });
        }
    });
}
function revokeSession(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            const session = yield db_1.db.refreshToken.findUnique({ where: { id }, select: { id: true, revoked: true } });
            if (!session)
                return res.status(404).json({ error: "Session not found" });
            if (session.revoked)
                return res.json({ ok: true, message: "Already revoked" });
            yield db_1.db.refreshToken.update({
                where: { id },
                data: { revoked: true, revokedAt: new Date() },
            });
            return res.json({ ok: true, message: "Session revoked" });
        }
        catch (err) {
            console.error("revokeSession error:", err);
            return res.status(500).json({ error: "Failed to revoke session" });
        }
    });
}
function revokeAllUserSessions(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { userId } = req.params;
        try {
            const { count } = yield db_1.db.refreshToken.updateMany({
                where: { userId, revoked: false },
                data: { revoked: true, revokedAt: new Date() },
            });
            return res.json({ ok: true, revokedCount: count });
        }
        catch (err) {
            console.error("revokeAllUserSessions error:", err);
            return res.status(500).json({ error: "Failed to revoke sessions" });
        }
    });
}
function getSessionStats(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const now = new Date();
            const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const [total, active, last24h, last7d, byCountry, byDevice] = yield Promise.all([
                db_1.db.refreshToken.count(),
                db_1.db.refreshToken.count({ where: { revoked: false, expiresAt: { gt: now } } }),
                db_1.db.refreshToken.count({ where: { createdAt: { gte: since24h } } }),
                db_1.db.refreshToken.count({ where: { createdAt: { gte: since7d } } }),
                db_1.db.refreshToken.findMany({
                    where: { country: { not: null } },
                    select: { country: true },
                    take: 2000,
                }),
                db_1.db.refreshToken.findMany({
                    where: { deviceType: { not: null } },
                    select: { deviceType: true },
                    take: 2000,
                }),
            ]);
            const countryMap = {};
            for (const r of byCountry)
                if (r.country)
                    countryMap[r.country] = ((_a = countryMap[r.country]) !== null && _a !== void 0 ? _a : 0) + 1;
            const topCountries = Object.entries(countryMap)
                .sort((a, b) => b[1] - a[1]).slice(0, 10)
                .map(([country, count]) => ({ country, count }));
            const deviceMap = {};
            for (const r of byDevice)
                if (r.deviceType)
                    deviceMap[r.deviceType] = ((_b = deviceMap[r.deviceType]) !== null && _b !== void 0 ? _b : 0) + 1;
            const byDeviceType = Object.entries(deviceMap).map(([type, count]) => ({ type, count }));
            return res.json({ data: { total, active, last24h, last7d, topCountries, byDeviceType }, error: null });
        }
        catch (err) {
            console.error("getSessionStats error:", err);
            return res.status(500).json({ data: null, error: "Failed to get session stats" });
        }
    });
}
