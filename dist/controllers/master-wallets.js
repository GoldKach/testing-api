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
exports.listMasterWallets = listMasterWallets;
exports.getMasterWalletByUser = getMasterWalletByUser;
exports.getMasterWalletById = getMasterWalletById;
exports.updateMasterWallet = updateMasterWallet;
exports.syncMasterWalletForUser = syncMasterWalletForUser;
const db_1 = require("../db/db");
const MASTER_INCLUDE = {
    user: {
        select: {
            id: true, firstName: true, lastName: true,
            email: true, phone: true, role: true, status: true,
        },
    },
};
function listMasterWallets(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { status } = req.query;
            const wallets = yield db_1.db.masterWallet.findMany({
                where: status ? { status: status } : undefined,
                orderBy: { createdAt: "desc" },
                include: MASTER_INCLUDE,
            });
            return res.status(200).json({ data: wallets, error: null });
        }
        catch (err) {
            console.error("listMasterWallets error:", err);
            return res.status(500).json({ data: null, error: "Failed to list master wallets" });
        }
    });
}
function getMasterWalletByUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userId } = req.params;
            let masterWallet = yield db_1.db.masterWallet.findUnique({
                where: { userId },
                include: Object.assign({}, MASTER_INCLUDE),
            });
            if (!masterWallet) {
                const user = yield db_1.db.user.findUnique({ where: { id: userId }, select: { id: true } });
                if (!user)
                    return res.status(404).json({ data: null, error: "User not found" });
                const accountNumber = `GK${Date.now().toString().slice(-9)}`;
                masterWallet = yield db_1.db.masterWallet.create({
                    data: {
                        userId,
                        accountNumber,
                        balance: 0,
                        totalDeposited: 0,
                        totalWithdrawn: 0,
                        totalFees: 0,
                        netAssetValue: 0,
                        status: "ACTIVE",
                    },
                    include: Object.assign({}, MASTER_INCLUDE),
                });
            }
            const portfolioWallets = yield db_1.db.portfolioWallet.findMany({
                where: { userPortfolio: { userId } },
                orderBy: { createdAt: "desc" },
                include: {
                    userPortfolio: {
                        select: {
                            id: true, customName: true, isActive: true,
                            portfolioValue: true, totalInvested: true, totalLossGain: true,
                            portfolio: { select: { id: true, name: true, riskTolerance: true, timeHorizon: true } },
                        },
                    },
                },
            });
            const activeWallets = portfolioWallets.filter((w) => { var _a; return (_a = w.userPortfolio) === null || _a === void 0 ? void 0 : _a.isActive; });
            const aggregateTotals = {
                totalBalance: activeWallets.reduce((s, w) => s + w.balance, 0),
                totalNAV: activeWallets.reduce((s, w) => s + w.netAssetValue, 0),
                totalFees: activeWallets.reduce((s, w) => s + w.totalFees, 0),
                portfolioCount: activeWallets.length,
            };
            return res.status(200).json({
                data: {
                    masterWallet,
                    portfolioWallets,
                    aggregateTotals,
                },
                error: null,
            });
        }
        catch (err) {
            console.error("getMasterWalletByUser error:", err);
            return res.status(500).json({ data: null, error: "Failed to fetch master wallet" });
        }
    });
}
function getMasterWalletById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const wallet = yield db_1.db.masterWallet.findUnique({
                where: { id },
                include: MASTER_INCLUDE,
            });
            if (!wallet)
                return res.status(404).json({ data: null, error: "Master wallet not found" });
            return res.status(200).json({ data: wallet, error: null });
        }
        catch (err) {
            console.error("getMasterWalletById error:", err);
            return res.status(500).json({ data: null, error: "Failed to fetch master wallet" });
        }
    });
}
function updateMasterWallet(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const current = yield db_1.db.masterWallet.findUnique({ where: { id } });
            if (!current)
                return res.status(404).json({ data: null, error: "Master wallet not found" });
            const { status, totalFees } = req.body;
            const data = {};
            if (status !== undefined)
                data.status = status;
            if (totalFees !== undefined)
                data.totalFees = Number(totalFees);
            if (!Object.keys(data).length) {
                return res.status(400).json({ data: null, error: "No updatable fields provided" });
            }
            const updated = yield db_1.db.masterWallet.update({ where: { id }, data, include: MASTER_INCLUDE });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (err) {
            console.error("updateMasterWallet error:", err);
            return res.status(500).json({ data: null, error: "Failed to update master wallet" });
        }
    });
}
function syncMasterWalletForUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { userId } = req.params;
            const user = yield db_1.db.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            const portfolioWallets = yield db_1.db.portfolioWallet.findMany({
                where: { userPortfolio: { userId } },
                select: { netAssetValue: true, totalFees: true, balance: true },
            });
            const totalNAV = portfolioWallets.reduce((s, w) => s + w.netAssetValue, 0);
            const totalFees = portfolioWallets.reduce((s, w) => s + w.totalFees, 0);
            const totalDeposited = yield db_1.db.deposit.aggregate({
                where: { userId, transactionStatus: "APPROVED" },
                _sum: { amount: true },
            });
            const totalWithdrawn = yield db_1.db.withdrawal.aggregate({
                where: { userId, transactionStatus: "APPROVED" },
                _sum: { amount: true },
            });
            const updated = yield db_1.db.masterWallet.update({
                where: { userId },
                data: {
                    netAssetValue: totalNAV,
                    totalFees,
                    totalDeposited: (_a = totalDeposited._sum.amount) !== null && _a !== void 0 ? _a : 0,
                    totalWithdrawn: (_b = totalWithdrawn._sum.amount) !== null && _b !== void 0 ? _b : 0,
                },
                include: MASTER_INCLUDE,
            });
            return res.status(200).json({ data: updated, error: null, message: "Master wallet synced" });
        }
        catch (err) {
            console.error("syncMasterWalletForUser error:", err);
            return res.status(500).json({ data: null, error: "Failed to sync master wallet" });
        }
    });
}
