"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const express_1 = require("express");
const auth_1 = require("../../utils/auth");
const transactionAuditLogger_1 = require("../../audit/transactionAuditLogger");
const db_1 = require("../../db/db");
const auditLogsRouter = (0, express_1.Router)();
auditLogsRouter.get("/compliance/audit-logs", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = "1", pageSize = "50", userId, transactionType, transactionStatus, startDate, endDate, search, } = req.query;
        const take = Math.min(Number(pageSize) || 50, 200);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
        const where = {};
        if (userId)
            where.userId = userId;
        if (transactionType)
            where.transactionType = transactionType;
        if (transactionStatus)
            where.transactionStatus = transactionStatus;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        if (search) {
            where.OR = [
                { userName: { contains: search, mode: "insensitive" } },
                { userEmail: { contains: search, mode: "insensitive" } },
                { transactionId: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { performedByName: { contains: search, mode: "insensitive" } },
            ];
        }
        const auditTable = db_1.db.transactionAuditLog;
        const [total, rows] = yield Promise.all([
            auditTable.count({ where }),
            auditTable.findMany({
                where,
                orderBy: { sequence: "desc" },
                skip,
                take,
            }),
        ]);
        res.json({
            data: {
                rows,
                total,
                page: Math.max(Number(page) || 1, 1),
                pageSize: take,
                totalPages: Math.ceil(total / take),
            },
            error: null,
        });
    }
    catch (err) {
        console.error("[audit-logs] list error", err);
        res.status(500).json({ data: null, error: "Failed to fetch audit logs" });
    }
}));
auditLogsRouter.get("/compliance/audit-logs/verify-integrity", auth_1.authenticateToken, (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield transactionAuditLogger_1.auditLogger.verifyChainIntegrity();
        res.json({ data: result, error: null });
    }
    catch (err) {
        console.error("[audit-logs] verify error", err);
        res
            .status(500)
            .json({ data: null, error: "Failed to verify chain integrity" });
    }
}));
auditLogsRouter.get("/compliance/audit-logs/export", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, transactionType, transactionStatus, startDate, endDate, search, } = req.query;
        const where = {};
        if (userId)
            where.userId = userId;
        if (transactionType)
            where.transactionType = transactionType;
        if (transactionStatus)
            where.transactionStatus = transactionStatus;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        if (search) {
            where.OR = [
                { userName: { contains: search, mode: "insensitive" } },
                { userEmail: { contains: search, mode: "insensitive" } },
                { transactionId: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { performedByName: { contains: search, mode: "insensitive" } },
            ];
        }
        const exportTable = db_1.db.transactionAuditLog;
        const rows = yield exportTable.findMany({
            where,
            orderBy: { sequence: "asc" },
        });
        const NAIROBI_OFFSET = 3 * 60 * 60 * 1000;
        const toNairobi = (d) => new Date(d.getTime() + NAIROBI_OFFSET)
            .toISOString()
            .replace("T", " ")
            .slice(0, 19);
        const csvEscape = (v) => {
            const s = v == null ? "" : String(v);
            return s.includes(",") || s.includes('"') || s.includes("\n")
                ? `"${s.replace(/"/g, '""')}"`
                : s;
        };
        const headers = [
            "sequence",
            "id",
            "transactionType",
            "transactionId",
            "transactionStatus",
            "userId",
            "userName",
            "userEmail",
            "performedByName",
            "performedByRole",
            "amount",
            "currency",
            "description",
            "ipAddress",
            "hash",
            "previousHash",
            "systemVersion",
            "createdAt (Africa/Nairobi)",
        ];
        const lines = [
            headers.join(","),
            ...rows.map((r) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                return [
                    r.sequence,
                    r.id,
                    r.transactionType,
                    (_a = r.transactionId) !== null && _a !== void 0 ? _a : "",
                    r.transactionStatus,
                    r.userId,
                    (_b = r.userName) !== null && _b !== void 0 ? _b : "",
                    (_c = r.userEmail) !== null && _c !== void 0 ? _c : "",
                    (_d = r.performedByName) !== null && _d !== void 0 ? _d : "",
                    (_e = r.performedByRole) !== null && _e !== void 0 ? _e : "",
                    (_f = r.amount) !== null && _f !== void 0 ? _f : "",
                    r.currency,
                    (_g = r.description) !== null && _g !== void 0 ? _g : "",
                    (_h = r.ipAddress) !== null && _h !== void 0 ? _h : "",
                    r.hash,
                    r.previousHash,
                    r.systemVersion,
                    toNairobi(r.createdAt),
                ]
                    .map(csvEscape)
                    .join(",");
            }),
        ];
        const csv = lines.join("\r\n");
        const timestamp = new Date().toISOString().slice(0, 10);
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="audit-log-${timestamp}.csv"`);
        res.send(csv);
    }
    catch (err) {
        console.error("[audit-logs] export error", err);
        res.status(500).json({ data: null, error: "Failed to export audit logs" });
    }
}));
auditLogsRouter.get("/compliance/audit-logs/:id", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const byIdTable = db_1.db.transactionAuditLog;
        const row = yield byIdTable.findUnique({
            where: { id: req.params.id },
        });
        if (!row) {
            return res
                .status(404)
                .json({ data: null, error: "Audit log entry not found" });
        }
        res.json({ data: row, error: null });
    }
    catch (err) {
        console.error("[audit-logs] getById error", err);
        res.status(500).json({ data: null, error: "Failed to fetch audit log" });
    }
}));
auditLogsRouter.get("/compliance/audit-report-data", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, include = "sessions,deposits,withdrawals" } = req.query;
        const sections = (include !== null && include !== void 0 ? include : "sessions,deposits,withdrawals")
            .split(",")
            .map((s) => s.trim().toLowerCase());
        const dateFilter = startDate || endDate
            ? {
                createdAt: Object.assign(Object.assign({}, (startDate ? { gte: new Date(startDate) } : {})), (endDate ? { lte: new Date(endDate) } : {})),
            }
            : {};
        const [loginSessions, deposits, withdrawals] = yield Promise.all([
            sections.includes("sessions")
                ? db_1.db.refreshToken.findMany({
                    where: dateFilter,
                    orderBy: { createdAt: "desc" },
                    take: 500,
                    select: {
                        id: true,
                        createdAt: true,
                        expiresAt: true,
                        revoked: true,
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                                role: true,
                            },
                        },
                    },
                })
                : Promise.resolve([]),
            sections.includes("deposits")
                ? db_1.db.deposit.findMany({
                    where: dateFilter,
                    orderBy: { createdAt: "desc" },
                    take: 500,
                    select: {
                        id: true,
                        amount: true,
                        depositTarget: true,
                        transactionStatus: true,
                        transactionId: true,
                        method: true,
                        description: true,
                        approvedByName: true,
                        approvedAt: true,
                        rejectedByName: true,
                        rejectedAt: true,
                        rejectReason: true,
                        createdByName: true,
                        createdAt: true,
                        bankCost: true,
                        transactionCost: true,
                        cashAtBank: true,
                        totalFees: true,
                        isFirstDeposit: true,
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        },
                    },
                })
                : Promise.resolve([]),
            sections.includes("withdrawals")
                ? db_1.db.withdrawal.findMany({
                    where: dateFilter,
                    orderBy: { createdAt: "desc" },
                    take: 500,
                    select: {
                        id: true,
                        amount: true,
                        withdrawalType: true,
                        transactionStatus: true,
                        transactionId: true,
                        bankName: true,
                        bankBranch: true,
                        description: true,
                        approvedByName: true,
                        approvedAt: true,
                        rejectedByName: true,
                        rejectedAt: true,
                        rejectReason: true,
                        createdByName: true,
                        createdAt: true,
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        },
                    },
                })
                : Promise.resolve([]),
        ]);
        res.json({
            data: { loginSessions, deposits, withdrawals },
            error: null,
        });
    }
    catch (err) {
        console.error("[audit-report-data] error", err);
        res
            .status(500)
            .json({ data: null, error: "Failed to fetch audit report data" });
    }
}));
auditLogsRouter.get("/compliance/general-audit-logs", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = "1", pageSize = "50", actorId, entityType, entityId, eventType, status, startDate, endDate, search, } = req.query;
        const take = Math.min(Number(pageSize) || 50, 200);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
        const where = {};
        if (actorId)
            where.actorId = actorId;
        if (entityType)
            where.entityType = entityType;
        if (entityId)
            where.entityId = entityId;
        if (eventType)
            where.eventType = eventType;
        if (status)
            where.status = status;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        if (search) {
            where.OR = [
                { action: { contains: search, mode: "insensitive" } },
                { actorName: { contains: search, mode: "insensitive" } },
                { actorEmail: { contains: search, mode: "insensitive" } },
                { entityId: { contains: search, mode: "insensitive" } },
                { ipAddress: { contains: search, mode: "insensitive" } },
            ];
        }
        const table = db_1.db.auditLog;
        const [total, rows] = yield Promise.all([
            table.count({ where }),
            table.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
        ]);
        res.json({
            data: {
                rows,
                total,
                page: Math.max(Number(page) || 1, 1),
                pageSize: take,
                totalPages: Math.ceil(total / take),
            },
            error: null,
        });
    }
    catch (err) {
        console.error("[general-audit-logs] error", err);
        res.status(500).json({ data: null, error: "Failed to fetch general audit logs" });
    }
}));
auditLogsRouter.get("/compliance/general-audit-logs/export", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { actorId, entityType, entityId, eventType, startDate, endDate } = req.query;
        const where = {};
        if (actorId)
            where.actorId = actorId;
        if (entityType)
            where.entityType = entityType;
        if (entityId)
            where.entityId = entityId;
        if (eventType)
            where.eventType = eventType;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const rows = yield db_1.db.auditLog.findMany({
            where,
            orderBy: { timestamp: "asc" },
            take: 10000,
        });
        const headers = [
            "id", "timestamp", "eventType", "action", "entityType", "entityId",
            "actorId", "actorType", "actorRole", "actorName", "actorEmail",
            "ipAddress", "status", "errorMessage", "createdAt",
        ];
        const csvEscape = (v) => {
            const s = v == null ? "" : String(v);
            return s.includes(",") || s.includes('"') || s.includes("\n")
                ? `"${s.replace(/"/g, '""')}"`
                : s;
        };
        const lines = [
            headers.join(","),
            ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
        ];
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="general-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(lines.join("\r\n"));
        const { auditService } = yield Promise.resolve().then(() => __importStar(require("../../audit/auditService")));
        auditService.logAudit({
            eventType: "DATA_EXPORTED",
            action: `General audit log exported (${rows.length} rows)`,
            actorId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId,
            actorRole: (_b = req.user) === null || _b === void 0 ? void 0 : _b.role,
            actorType: "STAFF",
            status: "SUCCESS",
            metadata: { rowCount: rows.length, filters: { actorId, entityType, eventType, startDate, endDate } },
        });
    }
    catch (err) {
        console.error("[general-audit-logs/export] error", err);
        res.status(500).json({ data: null, error: "Failed to export general audit logs" });
    }
}));
auditLogsRouter.get("/compliance/security-logs", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = "1", pageSize = "50", userId, eventType, riskLevel, ipAddress, resolved, startDate, endDate, } = req.query;
        const take = Math.min(Number(pageSize) || 50, 200);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
        const where = {};
        if (userId)
            where.userId = userId;
        if (eventType)
            where.eventType = eventType;
        if (riskLevel)
            where.riskLevel = riskLevel;
        if (ipAddress)
            where.ipAddress = ipAddress;
        if (resolved !== undefined)
            where.resolved = resolved === "true";
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const table = db_1.db.securityLog;
        const [total, rows] = yield Promise.all([
            table.count({ where }),
            table.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
        ]);
        res.json({
            data: { rows, total, page: Math.max(Number(page) || 1, 1), pageSize: take, totalPages: Math.ceil(total / take) },
            error: null,
        });
    }
    catch (err) {
        console.error("[security-logs] error", err);
        res.status(500).json({ data: null, error: "Failed to fetch security logs" });
    }
}));
auditLogsRouter.get("/compliance/security-logs/summary", auth_1.authenticateToken, (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const table = db_1.db.securityLog;
        const [critical, high, medium, low, unresolved] = yield Promise.all([
            table.count({ where: { riskLevel: "CRITICAL", createdAt: { gte: since } } }),
            table.count({ where: { riskLevel: "HIGH", createdAt: { gte: since } } }),
            table.count({ where: { riskLevel: "MEDIUM", createdAt: { gte: since } } }),
            table.count({ where: { riskLevel: "LOW", createdAt: { gte: since } } }),
            table.count({ where: { resolved: false } }),
        ]);
        res.json({
            data: { since, critical, high, medium, low, unresolved },
            error: null,
        });
    }
    catch (err) {
        console.error("[security-logs/summary] error", err);
        res.status(500).json({ data: null, error: "Failed to fetch security log summary" });
    }
}));
auditLogsRouter.get("/compliance/api-logs", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = "1", pageSize = "50", userId, method, endpoint, statusCode, startDate, endDate, } = req.query;
        const take = Math.min(Number(pageSize) || 50, 200);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
        const where = {};
        if (userId)
            where.userId = userId;
        if (method)
            where.method = method.toUpperCase();
        if (endpoint)
            where.endpoint = { contains: endpoint, mode: "insensitive" };
        if (statusCode)
            where.statusCode = Number(statusCode);
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const table = db_1.db.apiLog;
        const [total, rows] = yield Promise.all([
            table.count({ where }),
            table.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
        ]);
        res.json({
            data: { rows, total, page: Math.max(Number(page) || 1, 1), pageSize: take, totalPages: Math.ceil(total / take) },
            error: null,
        });
    }
    catch (err) {
        console.error("[api-logs] error", err);
        res.status(500).json({ data: null, error: "Failed to fetch API logs" });
    }
}));
auditLogsRouter.get("/compliance/system-logs", auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = "1", pageSize = "50", eventType, component, severity, startDate, endDate, } = req.query;
        const take = Math.min(Number(pageSize) || 50, 200);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
        const where = {};
        if (eventType)
            where.eventType = eventType;
        if (component)
            where.component = { contains: component, mode: "insensitive" };
        if (severity)
            where.severity = severity;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const table = db_1.db.systemLog;
        const [total, rows] = yield Promise.all([
            table.count({ where }),
            table.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
        ]);
        res.json({
            data: { rows, total, page: Math.max(Number(page) || 1, 1), pageSize: take, totalPages: Math.ceil(total / take) },
            error: null,
        });
    }
    catch (err) {
        console.error("[system-logs] error", err);
        res.status(500).json({ data: null, error: "Failed to fetch system logs" });
    }
}));
exports.default = auditLogsRouter;
