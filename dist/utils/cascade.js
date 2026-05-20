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
exports.cascadeClosePriceUpdates = cascadeClosePriceUpdates;
const db_1 = require("../db/db");
function cascadeClosePriceUpdates(updates) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        if (updates.length === 0)
            return;
        const priceMap = new Map(updates.map((u) => [u.assetId, u.closePrice]));
        const assetIds = [...priceMap.keys()];
        console.log(`[cascade] starting for ${assetIds.length} asset(s):`, assetIds);
        let portfolioAssets = [];
        let userAssets = [];
        try {
            [portfolioAssets, userAssets] = yield Promise.all([
                db_1.db.portfolioAsset.findMany({
                    where: { assetId: { in: assetIds } },
                    select: { id: true, assetId: true, stock: true, costPrice: true },
                }),
                db_1.db.userPortfolioAsset.findMany({
                    where: { assetId: { in: assetIds } },
                    select: { id: true, assetId: true, stock: true, costPrice: true, userPortfolioId: true },
                }),
            ]);
            console.log(`[cascade] step1: found ${portfolioAssets.length} portfolioAssets, ${userAssets.length} userAssets`);
        }
        catch (err) {
            console.error("[cascade] step1 FAILED — aborting:", err);
            return;
        }
        let step2ok = 0;
        for (const pa of portfolioAssets) {
            try {
                const newClose = priceMap.get(pa.assetId);
                const closeValue = newClose * Number(pa.stock);
                yield db_1.db.portfolioAsset.update({
                    where: { id: pa.id },
                    data: { closeValue, lossGain: closeValue - Number((_a = pa.costPrice) !== null && _a !== void 0 ? _a : 0) },
                });
                step2ok++;
            }
            catch (err) {
                console.error(`[cascade] step2 portfolioAsset id=${pa.id} FAILED:`, err);
            }
        }
        console.log(`[cascade] step2: updated ${step2ok}/${portfolioAssets.length} portfolioAssets`);
        let step3ok = 0;
        for (const ua of userAssets) {
            try {
                const newClose = priceMap.get(ua.assetId);
                const closeValue = newClose * Number(ua.stock);
                yield db_1.db.userPortfolioAsset.update({
                    where: { id: ua.id },
                    data: { closeValue, lossGain: closeValue - Number((_b = ua.costPrice) !== null && _b !== void 0 ? _b : 0) },
                });
                step3ok++;
            }
            catch (err) {
                console.error(`[cascade] step3 userPortfolioAsset id=${ua.id} FAILED:`, err);
            }
        }
        console.log(`[cascade] step3: updated ${step3ok}/${userAssets.length} userPortfolioAssets`);
        const affectedPortfolioIds = [...new Set(userAssets.map((ua) => ua.userPortfolioId))];
        const affectedUserIds = new Set();
        let step4ok = 0;
        for (const upId of affectedPortfolioIds) {
            try {
                const allAssets = yield db_1.db.userPortfolioAsset.findMany({
                    where: { userPortfolioId: upId },
                    select: { closeValue: true },
                });
                const portfolioValue = allAssets.reduce((s, r) => { var _a; return s + Number((_a = r.closeValue) !== null && _a !== void 0 ? _a : 0); }, 0);
                const up = yield db_1.db.userPortfolio.findUnique({
                    where: { id: upId },
                    select: { totalInvested: true, userId: true },
                });
                if (!up) {
                    console.warn(`[cascade] step4 userPortfolio id=${upId} not found — skipping`);
                    continue;
                }
                affectedUserIds.add(up.userId);
                const totalLossGain = portfolioValue - Number((_c = up.totalInvested) !== null && _c !== void 0 ? _c : 0);
                yield db_1.db.userPortfolio.update({
                    where: { id: upId },
                    data: { portfolioValue, totalLossGain },
                });
                step4ok++;
                console.log(`[cascade] step4 portfolio=${upId} portfolioValue=${portfolioValue.toFixed(2)} totalLossGain=${totalLossGain.toFixed(2)}`);
            }
            catch (err) {
                console.error(`[cascade] step4 userPortfolio id=${upId} FAILED:`, err);
            }
        }
        console.log(`[cascade] step4: updated ${step4ok}/${affectedPortfolioIds.length} userPortfolios`);
        let step5ok = 0;
        for (const userId of affectedUserIds) {
            try {
                const portfolios = yield db_1.db.userPortfolio.findMany({
                    where: { userId },
                    select: { portfolioValue: true },
                });
                const totalMarketValue = portfolios.reduce((s, p) => { var _a; return s + Number((_a = p.portfolioValue) !== null && _a !== void 0 ? _a : 0); }, 0);
                yield db_1.db.masterWallet.updateMany({
                    where: { userId },
                    data: { netAssetValue: totalMarketValue },
                });
                step5ok++;
                console.log(`[cascade] step5 user=${userId} masterWallet.netAssetValue=${totalMarketValue.toFixed(2)}`);
            }
            catch (err) {
                console.error(`[cascade] step5 userId=${userId} FAILED:`, err);
            }
        }
        console.log(`[cascade] step5: updated ${step5ok}/${affectedUserIds.size} masterWallets`);
        console.log(`[cascade] COMPLETE`);
    });
}
