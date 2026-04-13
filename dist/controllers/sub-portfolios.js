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
exports.listSubPortfolios = listSubPortfolios;
exports.getSubPortfolioById = getSubPortfolioById;
exports.updateSubPortfolio = updateSubPortfolio;
const db_1 = require("../db/db");
const SUB_INCLUDE = {
    assets: { include: { asset: true }, orderBy: { createdAt: "asc" } },
    userPortfolio: { select: { id: true, customName: true, userId: true, portfolioId: true } },
    mergedByTopup: { select: { id: true, status: true, mergedAt: true, topupAmount: true } },
};
function listSubPortfolios(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userPortfolioId, generation } = req.query;
            if (!userPortfolioId) {
                return res.status(400).json({ data: null, error: "userPortfolioId is required" });
            }
            const up = yield db_1.db.userPortfolio.findUnique({
                where: { id: userPortfolioId },
                select: { id: true, customName: true },
            });
            if (!up)
                return res.status(404).json({ data: null, error: "UserPortfolio not found" });
            const where = Object.assign({ userPortfolioId }, (generation !== undefined ? { generation: parseInt(generation, 10) } : {}));
            const items = yield db_1.db.subPortfolio.findMany({
                where,
                orderBy: { generation: "asc" },
                include: SUB_INCLUDE,
            });
            return res.status(200).json({ data: items, error: null });
        }
        catch (err) {
            console.error("listSubPortfolios error:", err);
            return res.status(500).json({ data: null, error: "Failed to list sub-portfolios" });
        }
    });
}
function getSubPortfolioById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const sub = yield db_1.db.subPortfolio.findUnique({
                where: { id },
                include: SUB_INCLUDE,
            });
            if (!sub)
                return res.status(404).json({ data: null, error: "SubPortfolio not found" });
            return res.status(200).json({ data: sub, error: null });
        }
        catch (err) {
            console.error("getSubPortfolioById error:", err);
            return res.status(500).json({ data: null, error: "Failed to fetch sub-portfolio" });
        }
    });
}
function updateSubPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const current = yield db_1.db.subPortfolio.findUnique({ where: { id } });
            if (!current)
                return res.status(404).json({ data: null, error: "SubPortfolio not found" });
            const { label, amountInvested, totalCostPrice, totalCloseValue, bankFee, transactionFee, feeAtBank, cashAtBank, snapshotDate, } = req.body;
            const data = {};
            if (label !== undefined)
                data.label = label;
            if (amountInvested !== undefined)
                data.amountInvested = amountInvested;
            if (totalCostPrice !== undefined)
                data.totalCostPrice = totalCostPrice;
            if (cashAtBank !== undefined)
                data.cashAtBank = cashAtBank;
            if (snapshotDate !== undefined)
                data.snapshotDate = new Date(snapshotDate);
            if (totalCloseValue !== undefined) {
                data.totalCloseValue = totalCloseValue;
                const costBasis = totalCostPrice !== null && totalCostPrice !== void 0 ? totalCostPrice : current.totalCostPrice;
                data.totalLossGain = totalCloseValue - costBasis;
            }
            const nextBankFee = bankFee !== null && bankFee !== void 0 ? bankFee : current.bankFee;
            const nextTransFee = transactionFee !== null && transactionFee !== void 0 ? transactionFee : current.transactionFee;
            const nextFeeAtBank = feeAtBank !== null && feeAtBank !== void 0 ? feeAtBank : current.feeAtBank;
            if (bankFee !== undefined || transactionFee !== undefined || feeAtBank !== undefined) {
                data.bankFee = nextBankFee;
                data.transactionFee = nextTransFee;
                data.feeAtBank = nextFeeAtBank;
                data.totalFees = nextBankFee + nextTransFee + nextFeeAtBank;
            }
            if (!Object.keys(data).length) {
                return res.status(400).json({ data: null, error: "No updatable fields provided" });
            }
            const updated = yield db_1.db.subPortfolio.update({ where: { id }, data, include: SUB_INCLUDE });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (err) {
            console.error("updateSubPortfolio error:", err);
            return res.status(500).json({ data: null, error: "Failed to update sub-portfolio" });
        }
    });
}
