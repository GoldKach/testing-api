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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLogRetentionJob = startLogRetentionJob;
exports.runRetentionCleanup = runRetentionCleanup;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../db/db");
const auditService_1 = require("../audit/auditService");
const days = (n) => n * 24 * 60 * 60 * 1000;
const RETENTION_MS = {
    auditLog: days(7 * 365),
    securityLog: days(7 * 365),
    apiLog: days(365),
    systemLog: days(365),
    activityLog: days(2 * 365),
};
function runRetentionCleanup() {
    return __awaiter(this, void 0, void 0, function* () {
        const startedAt = new Date();
        const summary = {};
        auditService_1.auditService.logSystem({
            eventType: "CRON_JOB_STARTED",
            component: "cron-job:log-retention",
            severity: "LOW",
            message: "Log retention cleanup started",
            metadata: { startedAt: startedAt.toISOString() },
        });
        try {
            const cutoff = new Date(Date.now() - RETENTION_MS.auditLog);
            const { count } = yield db_1.db.auditLog.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            summary.auditLog = count;
        }
        catch (err) {
            console.error("[logRetention] auditLog cleanup failed:", err);
            summary.auditLog = -1;
        }
        try {
            const cutoff = new Date(Date.now() - RETENTION_MS.securityLog);
            const { count } = yield db_1.db.securityLog.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            summary.securityLog = count;
        }
        catch (err) {
            console.error("[logRetention] securityLog cleanup failed:", err);
            summary.securityLog = -1;
        }
        try {
            const cutoff = new Date(Date.now() - RETENTION_MS.apiLog);
            const { count } = yield db_1.db.apiLog.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            summary.apiLog = count;
        }
        catch (err) {
            console.error("[logRetention] apiLog cleanup failed:", err);
            summary.apiLog = -1;
        }
        try {
            const cutoff = new Date(Date.now() - RETENTION_MS.systemLog);
            const { count } = yield db_1.db.systemLog.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            summary.systemLog = count;
        }
        catch (err) {
            console.error("[logRetention] systemLog cleanup failed:", err);
            summary.systemLog = -1;
        }
        try {
            const cutoff = new Date(Date.now() - RETENTION_MS.activityLog);
            const { count } = yield db_1.db.activityLog.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            summary.activityLog = count;
        }
        catch (err) {
            console.error("[logRetention] activityLog cleanup failed:", err);
            summary.activityLog = -1;
        }
        const durationMs = Date.now() - startedAt.getTime();
        const hasError = Object.values(summary).some((v) => v < 0);
        auditService_1.auditService.logSystem({
            eventType: hasError ? "CRON_JOB_FAILED" : "CRON_JOB_COMPLETED",
            component: "cron-job:log-retention",
            severity: hasError ? "HIGH" : "LOW",
            message: hasError
                ? "Log retention cleanup completed with errors"
                : "Log retention cleanup completed successfully",
            metadata: { summary, durationMs, retentionDays: {
                    auditLog: RETENTION_MS.auditLog / days(1),
                    securityLog: RETENTION_MS.securityLog / days(1),
                    apiLog: RETENTION_MS.apiLog / days(1),
                    systemLog: RETENTION_MS.systemLog / days(1),
                    activityLog: RETENTION_MS.activityLog / days(1),
                } },
        });
        console.log(`[logRetention] completed in ${durationMs}ms:`, JSON.stringify(summary));
    });
}
function startLogRetentionJob() {
    node_cron_1.default.schedule("0 3 * * *", () => __awaiter(this, void 0, void 0, function* () {
        try {
            yield runRetentionCleanup();
        }
        catch (err) {
            console.error("[logRetention] unexpected error:", err);
        }
    }));
    console.log("[logRetention] Retention job scheduled — runs daily at 03:00 AM");
}
