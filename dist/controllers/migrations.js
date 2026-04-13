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
exports.backfillPortfoliosToNewStructure = backfillPortfoliosToNewStructure;
const db_1 = require("../db/db");
const crypto_1 = require("crypto");
function generateAccountNumber(prefix) {
    return `${prefix}${(0, crypto_1.randomInt)(1000000, 10000000)}`;
}
function toNum(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}
function getUniqueAccountNumber(prefix, model) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let i = 0; i < 10; i++) {
            const accountNumber = generateAccountNumber(prefix);
            const conflict = model === "portfolioWallet"
                ? yield db_1.db.portfolioWallet.findUnique({ where: { accountNumber } })
                : yield db_1.db.masterWallet.findFirst({ where: { accountNumber } });
            if (!conflict)
                return accountNumber;
        }
        throw new Error(`Could not generate unique account number for prefix ${prefix}`);
    });
}
function backfillPortfoliosToNewStructure(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { dryRun = false, defaultBankFee = 30, defaultTransactionFee = 10, defaultFeeAtBank = 10, } = req.body;
            const defaultTotalFees = defaultBankFee + defaultTransactionFee + defaultFeeAtBank;
            const userPortfolios = yield db_1.db.userPortfolio.findMany({
                include: {
                    portfolio: true,
                    userAssets: { include: { asset: true } },
                    user: { include: { masterWallet: true } },
                },
                orderBy: { createdAt: "asc" },
            });
            const results = [];
            for (const up of userPortfolios) {
                const actions = [];
                try {
                    const totalCostPrice = up.userAssets.reduce((s, ua) => s + toNum(ua.costPrice), 0);
                    const totalCloseValue = up.userAssets.reduce((s, ua) => s + toNum(ua.closeValue), 0);
                    const totalLossGain = up.userAssets.reduce((s, ua) => s + toNum(ua.lossGain), 0);
                    const netAssetValue = totalCloseValue - defaultTotalFees;
                    if (!dryRun) {
                        yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                            var _a;
                            const patch = {};
                            if (!up.customName || up.customName.trim() === "") {
                                patch.customName = up.portfolio.name;
                                actions.push(`Set customName = "${up.portfolio.name}"`);
                            }
                            if (toNum(up.totalInvested) === 0 && totalCostPrice > 0) {
                                patch.totalInvested = totalCostPrice;
                                patch.totalLossGain = totalLossGain;
                                patch.portfolioValue = totalCloseValue;
                                actions.push(`Backfilled totalInvested=${totalCostPrice.toFixed(2)}`);
                            }
                            if (Object.keys(patch).length) {
                                yield tx.userPortfolio.update({ where: { id: up.id }, data: patch });
                            }
                            const existingWallet = yield tx.portfolioWallet.findUnique({
                                where: { userPortfolioId: up.id },
                            });
                            let walletId;
                            if (!existingWallet) {
                                const accountNumber = yield getUniqueAccountNumber("GKP", "portfolioWallet");
                                const wallet = yield tx.portfolioWallet.create({
                                    data: {
                                        accountNumber,
                                        userPortfolioId: up.id,
                                        balance: totalCostPrice,
                                        bankFee: defaultBankFee,
                                        transactionFee: defaultTransactionFee,
                                        feeAtBank: defaultFeeAtBank,
                                        totalFees: defaultTotalFees,
                                        netAssetValue,
                                        status: "ACTIVE",
                                    },
                                });
                                walletId = wallet.id;
                                actions.push(`Created PortfolioWallet [${wallet.id}]`);
                            }
                            else {
                                walletId = existingWallet.id;
                            }
                            const existingSub = yield tx.subPortfolio.findFirst({
                                where: { userPortfolioId: up.id, generation: 0 },
                            });
                            if (!existingSub) {
                                const customName = ((_a = up.customName) === null || _a === void 0 ? void 0 : _a.trim()) || up.portfolio.name;
                                const sub = yield tx.subPortfolio.create({
                                    data: {
                                        userPortfolioId: up.id,
                                        generation: 0,
                                        label: `${customName} - Initial`,
                                        amountInvested: totalCostPrice,
                                        totalCostPrice,
                                        totalCloseValue,
                                        totalLossGain,
                                        bankFee: defaultBankFee,
                                        transactionFee: defaultTransactionFee,
                                        feeAtBank: defaultFeeAtBank,
                                        totalFees: defaultTotalFees,
                                        cashAtBank: 0,
                                        snapshotDate: up.createdAt,
                                    },
                                });
                                actions.push(`Created SubPortfolio gen=0 [${sub.id}]`);
                                if (up.userAssets.length > 0) {
                                    yield tx.subPortfolioAsset.createMany({
                                        data: up.userAssets.map((ua) => {
                                            var _a;
                                            return ({
                                                subPortfolioId: sub.id,
                                                assetId: ua.assetId,
                                                allocationPercentage: toNum(ua.allocationPercentage),
                                                costPerShare: toNum(ua.costPerShare),
                                                costPrice: toNum(ua.costPrice),
                                                stock: toNum(ua.stock),
                                                closePrice: toNum((_a = ua.asset) === null || _a === void 0 ? void 0 : _a.closePrice),
                                                closeValue: toNum(ua.closeValue),
                                                lossGain: toNum(ua.lossGain),
                                            });
                                        }),
                                        skipDuplicates: true,
                                    });
                                    actions.push(`Created ${up.userAssets.length} SubPortfolioAsset snapshot(s)`);
                                }
                            }
                            if (!up.user.masterWallet) {
                                const accountNumber = yield getUniqueAccountNumber("GK", "masterWallet");
                                const mw = yield tx.masterWallet.create({
                                    data: {
                                        accountNumber,
                                        userId: up.userId,
                                        totalDeposited: totalCostPrice,
                                        totalWithdrawn: 0,
                                        totalFees: defaultTotalFees,
                                        netAssetValue,
                                        status: "ACTIVE",
                                    },
                                });
                                actions.push(`Created MasterWallet [${mw.id}]`);
                            }
                        }));
                    }
                    else {
                        if (!up.customName || up.customName.trim() === "")
                            actions.push(`Would set customName = "${up.portfolio.name}"`);
                        if (toNum(up.totalInvested) === 0 && totalCostPrice > 0)
                            actions.push(`Would backfill totalInvested=${totalCostPrice.toFixed(2)}`);
                        const existingWallet = yield db_1.db.portfolioWallet.findUnique({ where: { userPortfolioId: up.id } });
                        if (!existingWallet)
                            actions.push("Would create PortfolioWallet");
                        const existingSub = yield db_1.db.subPortfolio.findFirst({ where: { userPortfolioId: up.id, generation: 0 } });
                        if (!existingSub)
                            actions.push(`Would create SubPortfolio gen=0 + ${up.userAssets.length} asset snapshot(s)`);
                        if (!up.user.masterWallet)
                            actions.push("Would create MasterWallet");
                    }
                    results.push({
                        userPortfolioId: up.id,
                        userEmail: up.user.email,
                        portfolioName: up.portfolio.name,
                        actions,
                        status: actions.length > 0 ? "migrated" : "already_up_to_date",
                    });
                }
                catch (err) {
                    results.push({
                        userPortfolioId: up.id,
                        userEmail: up.user.email,
                        portfolioName: up.portfolio.name,
                        actions,
                        status: "failed",
                        error: err.message,
                    });
                }
            }
            if (!dryRun) {
                const allUsers = yield db_1.db.user.findMany({
                    where: { masterWallet: { isNot: null } },
                    select: { id: true },
                });
                for (const user of allUsers) {
                    const wallets = yield db_1.db.portfolioWallet.findMany({
                        where: { userPortfolio: { userId: user.id } },
                        select: { netAssetValue: true, totalFees: true },
                    });
                    const totalNAV = wallets.reduce((s, w) => s + toNum(w.netAssetValue), 0);
                    const totalFees = wallets.reduce((s, w) => s + toNum(w.totalFees), 0);
                    const [deposited, withdrawn] = yield Promise.all([
                        db_1.db.deposit.aggregate({
                            where: { userId: user.id, transactionStatus: "APPROVED" },
                            _sum: { amount: true },
                        }),
                        db_1.db.withdrawal.aggregate({
                            where: { userId: user.id, transactionStatus: "APPROVED" },
                            _sum: { amount: true },
                        }),
                    ]);
                    yield db_1.db.masterWallet.update({
                        where: { userId: user.id },
                        data: {
                            netAssetValue: totalNAV,
                            totalFees,
                            totalDeposited: (_a = deposited._sum.amount) !== null && _a !== void 0 ? _a : 0,
                            totalWithdrawn: (_b = withdrawn._sum.amount) !== null && _b !== void 0 ? _b : 0,
                        },
                    });
                }
            }
            const summary = {
                total: results.length,
                migrated: results.filter((r) => r.status === "migrated").length,
                already_up_to_date: results.filter((r) => r.status === "already_up_to_date").length,
                failed: results.filter((r) => r.status === "failed").length,
                dryRun,
            };
            const statusCode = summary.failed > 0 ? 207 : 200;
            return res.status(statusCode).json({
                data: { summary, results },
                error: summary.failed > 0 ? `${summary.failed} portfolio(s) failed to migrate` : null,
            });
        }
        catch (err) {
            console.error("backfillPortfoliosToNewStructure error:", err);
            return res.status(500).json({ data: null, error: "Migration failed: " + err.message });
        }
    });
}
