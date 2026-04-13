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
exports.createPortfolioAsset = createPortfolioAsset;
exports.listPortfolioAssets = listPortfolioAssets;
exports.getPortfolioAssetById = getPortfolioAssetById;
exports.updatePortfolioAsset = updatePortfolioAsset;
exports.deletePortfolioAsset = deletePortfolioAsset;
exports.listPortfolioAssetsForPortfolio = listPortfolioAssetsForPortfolio;
const db_1 = require("../db/db");
const toNum = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
};
const calcLossGain = (costPrice, closeValue) => closeValue - costPrice;
const ASSET_SELECT = {
    id: true,
    symbol: true,
    description: true,
    sector: true,
    assetClass: true,
    defaultAllocationPercentage: true,
    defaultCostPerShare: true,
    closePrice: true,
};
function createPortfolioAsset(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { portfolioId, assetId, defaultAllocationPercentage, defaultCostPerShare, } = req.body;
            if (!portfolioId || !assetId) {
                return res.status(400).json({ data: null, error: "portfolioId and assetId are required." });
            }
            const [portfolio, asset] = yield Promise.all([
                db_1.db.portfolio.findUnique({ where: { id: portfolioId }, select: { id: true } }),
                db_1.db.asset.findUnique({
                    where: { id: assetId },
                    select: {
                        id: true,
                        closePrice: true,
                        defaultAllocationPercentage: true,
                        defaultCostPerShare: true,
                    },
                }),
            ]);
            if (!portfolio)
                return res.status(404).json({ data: null, error: "Portfolio not found." });
            if (!asset)
                return res.status(404).json({ data: null, error: "Asset not found." });
            const stock = toNum(req.body.stock, 0);
            const costPrice = toNum(req.body.costPrice, 0);
            const closeValue = req.body.closeValue !== undefined && req.body.closeValue !== ""
                ? toNum(req.body.closeValue, 0)
                : toNum(asset.closePrice, 0);
            const allocPercent = defaultAllocationPercentage !== undefined
                ? toNum(defaultAllocationPercentage, 0)
                : toNum(asset.defaultAllocationPercentage, 0);
            const costPerShare = defaultCostPerShare !== undefined
                ? toNum(defaultCostPerShare, 0)
                : toNum(asset.defaultCostPerShare, 0);
            const lossGain = calcLossGain(costPrice, closeValue);
            const row = yield db_1.db.portfolioAsset.create({
                data: {
                    portfolioId,
                    assetId,
                    stock,
                    costPrice,
                    closeValue,
                    lossGain,
                    defaultAllocationPercentage: allocPercent,
                    defaultCostPerShare: costPerShare,
                },
                include: {
                    asset: { select: ASSET_SELECT },
                    portfolio: { select: { id: true, name: true, riskTolerance: true, timeHorizon: true } },
                },
            });
            return res.status(201).json({ data: row, error: null });
        }
        catch (e) {
            if ((e === null || e === void 0 ? void 0 : e.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Asset already exists in this portfolio." });
            }
            console.error("createPortfolioAsset error:", e);
            return res.status(500).json({ data: null, error: "Failed to create portfolio asset." });
        }
    });
}
function listPortfolioAssets(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { portfolioId } = req.query;
            const rows = yield db_1.db.portfolioAsset.findMany({
                where: portfolioId ? { portfolioId } : undefined,
                orderBy: { createdAt: "desc" },
                include: {
                    asset: { select: ASSET_SELECT },
                    portfolio: { select: { id: true, name: true } },
                },
            });
            return res.status(200).json({ data: rows, error: null });
        }
        catch (e) {
            console.error("listPortfolioAssets error:", e);
            return res.status(500).json({ data: null, error: "Failed to load portfolio assets." });
        }
    });
}
function getPortfolioAssetById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const row = yield db_1.db.portfolioAsset.findUnique({
                where: { id },
                include: {
                    asset: { select: ASSET_SELECT },
                    portfolio: { select: { id: true, name: true } },
                },
            });
            if (!row)
                return res.status(404).json({ data: null, error: "Portfolio asset not found." });
            return res.status(200).json({ data: row, error: null });
        }
        catch (e) {
            console.error("getPortfolioAssetById error:", e);
            return res.status(500).json({ data: null, error: "Failed to load portfolio asset." });
        }
    });
}
function updatePortfolioAsset(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const current = yield db_1.db.portfolioAsset.findUnique({ where: { id } });
            if (!current)
                return res.status(404).json({ data: null, error: "Portfolio asset not found." });
            const body = req.body;
            const stock = body.stock !== undefined ? toNum(body.stock, current.stock) : current.stock;
            const costPrice = body.costPrice !== undefined ? toNum(body.costPrice, current.costPrice) : current.costPrice;
            const closeValue = body.closeValue !== undefined ? toNum(body.closeValue, current.closeValue) : current.closeValue;
            const defaultAllocationPercentage = body.defaultAllocationPercentage !== undefined
                ? toNum(body.defaultAllocationPercentage, current.defaultAllocationPercentage)
                : current.defaultAllocationPercentage;
            const defaultCostPerShare = body.defaultCostPerShare !== undefined
                ? toNum(body.defaultCostPerShare, current.defaultCostPerShare)
                : current.defaultCostPerShare;
            const lossGain = calcLossGain(costPrice, closeValue);
            const updated = yield db_1.db.portfolioAsset.update({
                where: { id },
                data: {
                    stock,
                    costPrice,
                    closeValue,
                    lossGain,
                    defaultAllocationPercentage,
                    defaultCostPerShare,
                },
                include: {
                    asset: { select: ASSET_SELECT },
                    portfolio: { select: { id: true, name: true } },
                },
            });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (e) {
            if ((e === null || e === void 0 ? void 0 : e.code) === "P2025") {
                return res.status(404).json({ data: null, error: "Portfolio asset not found." });
            }
            console.error("updatePortfolioAsset error:", e);
            return res.status(500).json({ data: null, error: "Failed to update portfolio asset." });
        }
    });
}
function deletePortfolioAsset(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            yield db_1.db.portfolioAsset.delete({ where: { id } });
            return res.status(200).json({ data: null, error: null, message: "Portfolio asset deleted." });
        }
        catch (e) {
            if ((e === null || e === void 0 ? void 0 : e.code) === "P2025") {
                return res.status(404).json({ data: null, error: "Portfolio asset not found." });
            }
            console.error("deletePortfolioAsset error:", e);
            return res.status(500).json({ data: null, error: "Failed to delete portfolio asset." });
        }
    });
}
function listPortfolioAssetsForPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        req.query.portfolioId = req.params.portfolioId;
        return listPortfolioAssets(req, res);
    });
}
