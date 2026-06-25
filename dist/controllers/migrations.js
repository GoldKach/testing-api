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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetCostPerShareToOriginal = resetCostPerShareToOriginal;
exports.resetCostPriceAfterRedemptions = resetCostPriceAfterRedemptions;
exports.backfillPortfoliosToNewStructure = backfillPortfoliosToNewStructure;
exports.reactivateAllUsers = reactivateAllUsers;
const db_1 = require("../db/db");
const crypto_1 = require("crypto");
function resetCostPerShareToOriginal(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { dryRun = false } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
            const affectedPortfolios = yield db_1.db.userPortfolio.findMany({
                where: {
                    subPortfolios: { some: { generation: { gt: 0 } } },
                },
                include: {
                    userAssets: {
                        include: { asset: { select: { id: true, symbol: true } } },
                    },
                    subPortfolios: {
                        where: { generation: 0 },
                        include: { assets: true },
                    },
                },
            });
            const results = [];
            let totalUpdated = 0;
            for (const up of affectedPortfolios) {
                const gen0Sub = up.subPortfolios.find((s) => s.generation === 0);
                if (!gen0Sub)
                    continue;
                const originalPrices = new Map();
                for (const spa of gen0Sub.assets) {
                    originalPrices.set(spa.assetId, spa.costPerShare);
                }
                const changes = [];
                for (const ua of up.userAssets) {
                    const originalCPS = originalPrices.get(ua.assetId);
                    if (originalCPS === undefined)
                        continue;
                    if (Math.abs(ua.costPerShare - originalCPS) < 0.0001)
                        continue;
                    changes.push({
                        assetId: ua.assetId,
                        symbol: ua.asset.symbol,
                        from: ua.costPerShare,
                        to: originalCPS,
                    });
                    if (!dryRun) {
                        yield db_1.db.userPortfolioAsset.update({
                            where: { id: ua.id },
                            data: { costPerShare: originalCPS },
                        });
                        totalUpdated++;
                    }
                }
                if (changes.length > 0) {
                    results.push({ userPortfolioId: up.id, customName: (_b = up.customName) !== null && _b !== void 0 ? _b : up.id, changes });
                }
            }
            console.log("============================================================");
            console.log(`${dryRun ? "[DRY RUN] " : ""}RESET COST PER SHARE MIGRATION`);
            console.log(`  Portfolios affected : ${results.length}`);
            if (!dryRun)
                console.log(`  Asset rows updated  : ${totalUpdated}`);
            console.log("============================================================");
            return res.status(200).json({
                data: Object.assign(Object.assign({ dryRun, portfoliosAffected: results.length }, (dryRun ? {} : { totalAssetsUpdated: totalUpdated })), { details: results }),
                error: null,
                message: dryRun
                    ? `Dry run: ${results.length} portfolio(s) have drifted costPerShare — no changes applied.`
                    : `Reset complete: ${results.length} portfolio(s), ${totalUpdated} asset row(s) updated.`,
            });
        }
        catch (err) {
            console.error("resetCostPerShareToOriginal error:", err);
            return res.status(500).json({ data: null, error: "Migration failed: " + err.message });
        }
    });
}
function resetCostPriceAfterRedemptions(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const { dryRun = false } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
            const affectedPortfolios = yield db_1.db.userPortfolio.findMany({
                where: {
                    subPortfolios: {
                        some: { generation: { gt: 0 }, topupEventId: null },
                    },
                },
                include: {
                    userAssets: {
                        include: { asset: { select: { id: true, symbol: true, closePrice: true } } },
                    },
                    subPortfolios: {
                        select: { generation: true, amountInvested: true, topupEventId: true },
                    },
                    wallet: { select: { id: true, netAssetValue: true } },
                },
            });
            const results = [];
            let totalAssetsUpdated = 0;
            for (const up of affectedPortfolios) {
                const correctTotalInvested = up.subPortfolios.reduce((sum, sp) => {
                    const isOriginal = sp.generation === 0;
                    const isTopup = sp.topupEventId !== null;
                    return sum + ((isOriginal || isTopup) ? Number(sp.amountInvested) : 0);
                }, 0);
                const previousTotalInvested = Number(up.totalInvested);
                if (Math.abs(correctTotalInvested - previousTotalInvested) < 0.01)
                    continue;
                const assetChanges = [];
                for (const ua of up.userAssets) {
                    const correctCostPrice = (ua.allocationPercentage / 100) * correctTotalInvested;
                    const currentCloseValue = Number(ua.closeValue);
                    const correctLossGain = currentCloseValue - correctCostPrice;
                    if (Math.abs(Number(ua.costPrice) - correctCostPrice) < 0.01)
                        continue;
                    assetChanges.push({
                        id: ua.id,
                        assetId: ua.assetId,
                        symbol: ua.asset.symbol,
                        costPriceFrom: Number(ua.costPrice),
                        costPriceTo: correctCostPrice,
                        lossGainFrom: Number(ua.lossGain),
                        lossGainTo: correctLossGain,
                        newCloseValue: currentCloseValue,
                    });
                }
                if (!dryRun) {
                    for (const ch of assetChanges) {
                        yield db_1.db.userPortfolioAsset.update({
                            where: { id: ch.id },
                            data: { costPrice: ch.costPriceTo, lossGain: ch.lossGainTo },
                        });
                        totalAssetsUpdated++;
                    }
                    const portfolioValue = Number((_b = up.portfolioValue) !== null && _b !== void 0 ? _b : 0);
                    yield db_1.db.userPortfolio.update({
                        where: { id: up.id },
                        data: {
                            totalInvested: correctTotalInvested,
                            totalLossGain: portfolioValue - correctTotalInvested,
                        },
                    });
                    if (up.wallet) {
                        yield db_1.db.portfolioWallet.update({
                            where: { id: up.wallet.id },
                            data: { netAssetValue: correctTotalInvested },
                        });
                    }
                }
                results.push({
                    userPortfolioId: up.id,
                    customName: (_c = up.customName) !== null && _c !== void 0 ? _c : up.id,
                    previousTotalInvested,
                    correctTotalInvested,
                    assetChanges: assetChanges.map((_a) => {
                        var { id: _id, newCloseValue: _cv } = _a, rest = __rest(_a, ["id", "newCloseValue"]);
                        return rest;
                    }),
                });
            }
            console.log("============================================================");
            console.log(`${dryRun ? "[DRY RUN] " : ""}RESET COST PRICE AFTER REDEMPTIONS`);
            console.log(`  Portfolios affected : ${results.length}`);
            if (!dryRun)
                console.log(`  Asset rows updated  : ${totalAssetsUpdated}`);
            console.log("============================================================");
            return res.status(200).json({
                data: Object.assign(Object.assign({ dryRun, portfoliosAffected: results.length }, (dryRun ? {} : { totalAssetsUpdated })), { details: results }),
                error: null,
                message: dryRun
                    ? `Dry run: ${results.length} portfolio(s) have incorrect costPrice from past redemptions — no changes applied.`
                    : `Reset complete: ${results.length} portfolio(s), ${totalAssetsUpdated} asset row(s) updated.`,
            });
        }
        catch (err) {
            console.error("resetCostPriceAfterRedemptions error:", err);
            return res.status(500).json({ data: null, error: "Migration failed: " + err.message });
        }
    });
}
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
function reactivateAllUsers(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const usersResult = yield db_1.db.user.updateMany({
                where: {
                    status: { in: ["DEACTIVATED", "INACTIVE", "SUSPENDED"] },
                },
                data: {
                    status: "ACTIVE",
                    zeroBalanceStartedAt: null,
                    zeroBalanceWarningSentAt: null,
                },
            });
            const masterWalletsResult = yield db_1.db.masterWallet.updateMany({
                where: { status: { in: ["INACTIVE", "FROZEN", "CLOSED"] } },
                data: { status: "ACTIVE" },
            });
            const portfolioWalletsResult = yield db_1.db.portfolioWallet.updateMany({
                where: { status: { in: ["INACTIVE", "FROZEN", "CLOSED"] } },
                data: { status: "ACTIVE" },
            });
            console.log("============================================================");
            console.log("✅ REACTIVATE ALL USERS MIGRATION COMPLETE");
            console.log(`   Users reactivated         : ${usersResult.count}`);
            console.log(`   Master wallets reactivated : ${masterWalletsResult.count}`);
            console.log(`   Portfolio wallets reactivated: ${portfolioWalletsResult.count}`);
            console.log("============================================================");
            return res.status(200).json({
                data: {
                    usersReactivated: usersResult.count,
                    masterWalletsReactivated: masterWalletsResult.count,
                    portfolioWalletsReactivated: portfolioWalletsResult.count,
                },
                error: null,
                message: `Reactivated ${usersResult.count} user(s), ${masterWalletsResult.count} master wallet(s), ${portfolioWalletsResult.count} portfolio wallet(s).`,
            });
        }
        catch (err) {
            console.error("reactivateAllUsers error:", err);
            return res.status(500).json({ data: null, error: "Reactivation failed: " + err.message });
        }
    });
}
