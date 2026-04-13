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
exports.listPortfolioWallets = listPortfolioWallets;
exports.getPortfolioWalletById = getPortfolioWalletById;
exports.getPortfolioWalletByPortfolio = getPortfolioWalletByPortfolio;
exports.updatePortfolioWallet = updatePortfolioWallet;
const db_1 = require("../db/db");
const WALLET_INCLUDE = {
    userPortfolio: {
        select: {
            id: true, customName: true, userId: true,
            portfolioValue: true, totalInvested: true, totalLossGain: true,
            portfolio: { select: { id: true, name: true } },
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
    },
};
function listPortfolioWallets(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userId, status } = req.query;
            const where = Object.assign(Object.assign({}, (userId ? { userPortfolio: { userId } } : {})), (status ? { status: status } : {}));
            const wallets = yield db_1.db.portfolioWallet.findMany({
                where,
                orderBy: { createdAt: "desc" },
                include: WALLET_INCLUDE,
            });
            return res.status(200).json({ data: wallets, error: null });
        }
        catch (err) {
            console.error("listPortfolioWallets error:", err);
            return res.status(500).json({ data: null, error: "Failed to list portfolio wallets" });
        }
    });
}
function getPortfolioWalletById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const wallet = yield db_1.db.portfolioWallet.findUnique({
                where: { id },
                include: WALLET_INCLUDE,
            });
            if (!wallet)
                return res.status(404).json({ data: null, error: "Portfolio wallet not found" });
            return res.status(200).json({ data: wallet, error: null });
        }
        catch (err) {
            console.error("getPortfolioWalletById error:", err);
            return res.status(500).json({ data: null, error: "Failed to fetch portfolio wallet" });
        }
    });
}
function getPortfolioWalletByPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userPortfolioId } = req.params;
            const wallet = yield db_1.db.portfolioWallet.findUnique({
                where: { userPortfolioId },
                include: WALLET_INCLUDE,
            });
            if (!wallet)
                return res.status(404).json({ data: null, error: "Portfolio wallet not found" });
            return res.status(200).json({ data: wallet, error: null });
        }
        catch (err) {
            console.error("getPortfolioWalletByPortfolio error:", err);
            return res.status(500).json({ data: null, error: "Failed to fetch portfolio wallet" });
        }
    });
}
function updatePortfolioWallet(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const current = yield db_1.db.portfolioWallet.findUnique({ where: { id } });
            if (!current)
                return res.status(404).json({ data: null, error: "Portfolio wallet not found" });
            const { bankFee, transactionFee, feeAtBank, status } = req.body;
            const data = {};
            const nextBankFee = bankFee !== undefined ? Number(bankFee) : current.bankFee;
            const nextTransFee = transactionFee !== undefined ? Number(transactionFee) : current.transactionFee;
            const nextFeeAtBank = feeAtBank !== undefined ? Number(feeAtBank) : current.feeAtBank;
            if (bankFee !== undefined || transactionFee !== undefined || feeAtBank !== undefined) {
                data.bankFee = nextBankFee;
                data.transactionFee = nextTransFee;
                data.feeAtBank = nextFeeAtBank;
                data.totalFees = nextBankFee + nextTransFee + nextFeeAtBank;
                data.netAssetValue = current.balance - (nextBankFee + nextTransFee + nextFeeAtBank);
            }
            if (status !== undefined)
                data.status = status;
            if (!Object.keys(data).length) {
                return res.status(400).json({ data: null, error: "No updatable fields provided" });
            }
            const updated = yield db_1.db.portfolioWallet.update({ where: { id }, data, include: WALLET_INCLUDE });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (err) {
            console.error("updatePortfolioWallet error:", err);
            return res.status(500).json({ data: null, error: "Failed to update portfolio wallet" });
        }
    });
}
