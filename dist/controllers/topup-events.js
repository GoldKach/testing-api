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
exports.listTopupEvents = listTopupEvents;
exports.getTopupEventById = getTopupEventById;
exports.getTopupTimeline = getTopupTimeline;
const db_1 = require("../db/db");
const TOPUP_INCLUDE = {
    deposit: {
        select: {
            id: true, amount: true, transactionStatus: true,
            createdByName: true, approvedByName: true, createdAt: true,
        },
    },
    userPortfolio: {
        select: {
            id: true, customName: true, userId: true,
            portfolio: { select: { id: true, name: true } },
        },
    },
    mergedSubPortfolios: {
        orderBy: { generation: "asc" },
        include: { assets: { include: { asset: true } } },
    },
};
function listTopupEvents(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { userPortfolioId, userId, status } = req.query;
            const page = Math.max(1, parseInt(String((_a = req.query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
            const pageSize = Math.min(100, Math.max(1, parseInt(String((_b = req.query.pageSize) !== null && _b !== void 0 ? _b : "20"), 10) || 20));
            const where = Object.assign(Object.assign(Object.assign({}, (userPortfolioId ? { userPortfolioId } : {})), (userId ? { userPortfolio: { userId } } : {})), (status ? { status: status } : {}));
            const [total, items] = yield db_1.db.$transaction([
                db_1.db.topupEvent.count({ where }),
                db_1.db.topupEvent.findMany({
                    where,
                    orderBy: { createdAt: "desc" },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    include: TOPUP_INCLUDE,
                }),
            ]);
            return res.status(200).json({
                data: items,
                meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
                error: null,
            });
        }
        catch (err) {
            console.error("listTopupEvents error:", err);
            return res.status(500).json({ data: null, error: "Failed to list top-up events" });
        }
    });
}
function getTopupEventById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const event = yield db_1.db.topupEvent.findUnique({
                where: { id },
                include: TOPUP_INCLUDE,
            });
            if (!event)
                return res.status(404).json({ data: null, error: "TopupEvent not found" });
            return res.status(200).json({ data: event, error: null });
        }
        catch (err) {
            console.error("getTopupEventById error:", err);
            return res.status(500).json({ data: null, error: "Failed to fetch top-up event" });
        }
    });
}
function getTopupTimeline(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userPortfolioId } = req.params;
            const events = yield db_1.db.topupEvent.findMany({
                where: { userPortfolioId },
                orderBy: { createdAt: "asc" },
                include: {
                    deposit: { select: { id: true, amount: true, createdAt: true, approvedAt: true } },
                    mergedSubPortfolios: {
                        orderBy: { generation: "asc" },
                        select: { id: true, generation: true, label: true, amountInvested: true, totalCloseValue: true, totalFees: true },
                    },
                },
            });
            const timeline = events.map((e) => {
                var _a, _b;
                return ({
                    eventId: e.id,
                    topupAmount: e.topupAmount,
                    previousTotal: e.previousTotal,
                    newTotalInvested: e.newTotalInvested,
                    newCloseValue: e.newTotalCloseValue,
                    newNAV: e.newNetAssetValue,
                    gainLoss: e.newTotalLossGain,
                    totalFees: e.newTotalFees,
                    status: e.status,
                    mergedAt: e.mergedAt,
                    slices: e.mergedSubPortfolios,
                    depositDate: (_a = e.deposit) === null || _a === void 0 ? void 0 : _a.createdAt,
                    approvedAt: (_b = e.deposit) === null || _b === void 0 ? void 0 : _b.approvedAt,
                });
            });
            return res.status(200).json({ data: timeline, error: null });
        }
        catch (err) {
            console.error("getTopupTimeline error:", err);
            return res.status(500).json({ data: null, error: "Failed to fetch top-up timeline" });
        }
    });
}
