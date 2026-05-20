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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogger = exports.TransactionAuditLogger = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db/db");
class TransactionAuditLogger {
    constructor(systemVersion = "1.0.0") {
        this.systemVersion = systemVersion;
    }
    computeHash(fields) {
        var _a;
        const payload = [
            fields.previousHash,
            fields.id,
            String(fields.sequence),
            fields.transactionType,
            (_a = fields.transactionId) !== null && _a !== void 0 ? _a : "",
            fields.transactionStatus,
            fields.userId,
            fields.amount != null ? String(fields.amount) : "",
            fields.currency,
            fields.systemVersion,
            fields.createdAt,
        ].join("|");
        return crypto_1.default.createHash("sha256").update(payload).digest("hex");
    }
    log(entry, tx) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const client = tx !== null && tx !== void 0 ? tx : db_1.db;
            const auditClient = client.transactionAuditLog;
            const lastRows = yield auditClient.findMany({
                orderBy: { sequence: "desc" },
                take: 1,
                select: { hash: true, sequence: true },
            });
            const previousHash = lastRows.length > 0 ? lastRows[0].hash : "GENESIS";
            const nextSequence = lastRows.length > 0 ? lastRows[0].sequence + 1 : 1;
            const id = crypto_1.default.randomUUID();
            const createdAt = new Date();
            const hash = this.computeHash({
                previousHash,
                id,
                sequence: nextSequence,
                transactionType: entry.transactionType,
                transactionId: (_a = entry.transactionId) !== null && _a !== void 0 ? _a : null,
                transactionStatus: entry.transactionStatus,
                userId: entry.userId,
                amount: (_b = entry.amount) !== null && _b !== void 0 ? _b : null,
                currency: (_c = entry.currency) !== null && _c !== void 0 ? _c : "USD",
                systemVersion: this.systemVersion,
                createdAt: createdAt.toISOString(),
            });
            const row = yield auditClient.create({
                data: {
                    id,
                    sequence: nextSequence,
                    transactionType: entry.transactionType,
                    transactionId: entry.transactionId,
                    transactionStatus: entry.transactionStatus,
                    userId: entry.userId,
                    userName: entry.userName,
                    userEmail: entry.userEmail,
                    performedById: entry.performedById,
                    performedByName: entry.performedByName,
                    performedByRole: entry.performedByRole,
                    amount: entry.amount,
                    currency: (_d = entry.currency) !== null && _d !== void 0 ? _d : "USD",
                    description: entry.description,
                    metadata: entry.metadata,
                    hash,
                    previousHash,
                    ipAddress: entry.ipAddress,
                    userAgent: entry.userAgent,
                    systemVersion: this.systemVersion,
                    createdAt,
                },
            });
            return row;
        });
    }
    verifyChainIntegrity() {
        return __awaiter(this, void 0, void 0, function* () {
            const auditTable = db_1.db.transactionAuditLog;
            const rows = yield auditTable.findMany({
                orderBy: { sequence: "asc" },
                select: {
                    id: true,
                    sequence: true,
                    transactionType: true,
                    transactionId: true,
                    transactionStatus: true,
                    userId: true,
                    amount: true,
                    currency: true,
                    systemVersion: true,
                    createdAt: true,
                    hash: true,
                    previousHash: true,
                },
            });
            let expectedPreviousHash = "GENESIS";
            for (const row of rows) {
                const expected = this.computeHash({
                    previousHash: expectedPreviousHash,
                    id: row.id,
                    sequence: row.sequence,
                    transactionType: row.transactionType,
                    transactionId: row.transactionId,
                    transactionStatus: row.transactionStatus,
                    userId: row.userId,
                    amount: row.amount,
                    currency: row.currency,
                    systemVersion: row.systemVersion,
                    createdAt: row.createdAt.toISOString(),
                });
                if (expected !== row.hash || row.previousHash !== expectedPreviousHash) {
                    return {
                        valid: false,
                        totalRows: rows.length,
                        firstBrokenSequence: row.sequence,
                        brokenAt: row.id,
                        checkedAt: new Date(),
                    };
                }
                expectedPreviousHash = row.hash;
            }
            return {
                valid: true,
                totalRows: rows.length,
                firstBrokenSequence: null,
                brokenAt: null,
                checkedAt: new Date(),
            };
        });
    }
}
exports.TransactionAuditLogger = TransactionAuditLogger;
exports.auditLogger = new TransactionAuditLogger((_a = process.env.SYSTEM_VERSION) !== null && _a !== void 0 ? _a : "1.0.0");
