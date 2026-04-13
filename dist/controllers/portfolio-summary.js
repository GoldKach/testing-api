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
exports.getPortfolioSummary = getPortfolioSummary;
exports.refreshPortfolioSummary = refreshPortfolioSummary;
const db_1 = require("../db/db");
function getPortfolioSummary(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userId } = req.params;
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { id: true, firstName: true, lastName: true, email: true },
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            const [masterWallet, userPortfolios] = yield Promise.all([
                db_1.db.masterWallet.findUnique({
                    where: { userId },
                    select: {
                        id: true, accountNumber: true,
                        totalDeposited: true, totalWithdrawn: true,
                        totalFees: true, netAssetValue: true, status: true,
                    },
                }),
                db_1.db.userPortfolio.findMany({
                    where: { userId, isActive: true },
                    orderBy: { createdAt: "asc" },
                    include: {
                        portfolio: { select: { id: true, name: true, riskTolerance: true, timeHorizon: true } },
                        wallet: true,
                        userAssets: {
                            include: { asset: { select: { id: true, symbol: true, description: true, assetClass: true, closePrice: true } } },
                        },
                        subPortfolios: {
                            orderBy: { generation: "asc" },
                            select: {
                                id: true, generation: true, label: true,
                                amountInvested: true, totalCostPrice: true,
                                totalCloseValue: true, totalLossGain: true,
                                totalFees: true, cashAtBank: true, snapshotDate: true,
                            },
                        },
                        topupEvents: {
                            orderBy: { createdAt: "desc" },
                            take: 5,
                            select: {
                                id: true, topupAmount: true, previousTotal: true,
                                newTotalInvested: true, newTotalCloseValue: true,
                                newNetAssetValue: true, newTotalFees: true,
                                status: true, mergedAt: true, createdAt: true,
                            },
                        },
                    },
                }),
            ]);
            const reportMap = new Map();
            yield Promise.all(userPortfolios.map((up) => __awaiter(this, void 0, void 0, function* () {
                const report = yield db_1.db.userPortfolioPerformanceReport.findFirst({
                    where: { userPortfolioId: up.id },
                    orderBy: { reportDate: "desc" },
                    include: { assetBreakdown: true, subPortfolioSnapshots: { orderBy: { generation: "asc" } } },
                });
                if (report)
                    reportMap.set(up.id, report);
            })));
            const portfolios = userPortfolios.map((up) => {
                var _a;
                return ({
                    id: up.id,
                    customName: up.customName,
                    portfolio: up.portfolio,
                    wallet: up.wallet,
                    totalInvested: up.totalInvested,
                    portfolioValue: up.portfolioValue,
                    totalLossGain: up.totalLossGain,
                    returnPct: up.totalInvested > 0 ? (up.totalLossGain / up.totalInvested) * 100 : 0,
                    assets: up.userAssets,
                    subPortfolios: up.subPortfolios,
                    topupHistory: up.topupEvents,
                    latestReport: (_a = reportMap.get(up.id)) !== null && _a !== void 0 ? _a : null,
                });
            });
            const totalInvested = portfolios.reduce((s, p) => s + p.totalInvested, 0);
            const totalGainLoss = portfolios.reduce((s, p) => s + p.totalLossGain, 0);
            const aggregate = {
                totalInvested,
                totalValue: portfolios.reduce((s, p) => s + p.portfolioValue, 0),
                totalGainLoss,
                totalFees: portfolios.reduce((s, p) => { var _a, _b; return s + ((_b = (_a = p.wallet) === null || _a === void 0 ? void 0 : _a.totalFees) !== null && _b !== void 0 ? _b : 0); }, 0),
                portfolioCount: portfolios.length,
                returnPct: totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0,
            };
            return res.status(200).json({
                data: {
                    user,
                    masterWallet,
                    aggregate,
                    portfolios,
                },
                error: null,
            });
        }
        catch (err) {
            console.error("getPortfolioSummary error:", err);
            return res.status(500).json({ data: null, error: "Failed to fetch portfolio summary" });
        }
    });
}
function refreshPortfolioSummary(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userId } = req.params;
            const user = yield db_1.db.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            const userPortfolios = yield db_1.db.userPortfolio.findMany({
                where: { userId, isActive: true },
                include: {
                    wallet: { select: { id: true, netAssetValue: true, totalFees: true } },
                    userAssets: {
                        include: { asset: { select: { id: true, closePrice: true } } },
                    },
                },
            });
            const results = [];
            yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                for (const up of userPortfolios) {
                    if (!up.wallet)
                        continue;
                    const nav = up.wallet.netAssetValue;
                    let totalValue = 0;
                    let totalCost = 0;
                    for (const ua of up.userAssets) {
                        const costPrice = (ua.allocationPercentage / 100) * nav;
                        const stock = ua.costPerShare > 0 ? costPrice / ua.costPerShare : 0;
                        const closeValue = ua.asset.closePrice * stock;
                        const lossGain = closeValue - costPrice;
                        yield tx.userPortfolioAsset.update({
                            where: { id: ua.id },
                            data: { costPrice, stock, closeValue, lossGain },
                        });
                        totalValue += closeValue;
                        totalCost += costPrice;
                    }
                    yield tx.userPortfolio.update({
                        where: { id: up.id },
                        data: {
                            portfolioValue: totalValue,
                            totalInvested: totalCost,
                            totalLossGain: totalValue - totalCost,
                        },
                    });
                    yield tx.portfolioWallet.update({
                        where: { id: up.wallet.id },
                        data: { netAssetValue: totalValue - up.wallet.totalFees },
                    });
                    results.push({ portfolioId: up.id, customName: up.customName, newValue: totalValue });
                }
                const wallets = yield tx.portfolioWallet.findMany({
                    where: { userPortfolio: { userId } },
                    select: { netAssetValue: true },
                });
                const totalNAV = wallets.reduce((s, w) => s + w.netAssetValue, 0);
                yield tx.masterWallet.updateMany({
                    where: { userId },
                    data: { netAssetValue: totalNAV },
                });
            }));
            return res.status(200).json({
                data: results,
                message: `Refreshed ${results.length} portfolios`,
                error: null,
            });
        }
        catch (err) {
            console.error("refreshPortfolioSummary error:", err);
            return res.status(500).json({ data: null, error: "Failed to refresh portfolio summary" });
        }
    });
}
