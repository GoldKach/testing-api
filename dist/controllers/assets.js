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
exports.listAssets = listAssets;
exports.getAssetById = getAssetById;
exports.getAssetBySymbol = getAssetBySymbol;
exports.createAsset = createAsset;
exports.updateAsset = updateAsset;
exports.deleteAsset = deleteAsset;
exports.batchUpdateAssetPrices = batchUpdateAssetPrices;
const db_1 = require("../db/db");
function normalizeSymbol(sym) {
    return sym === null || sym === void 0 ? void 0 : sym.trim().toUpperCase();
}
function num(v, def = 0) {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : def;
}
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}
const SORTABLE_FIELDS = new Set([
    "symbol",
    "sector",
    "defaultAllocationPercentage",
    "defaultCostPerShare",
    "closePrice",
    "createdAt",
    "updatedAt",
]);
function listAssets(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const q = req.query.q || "";
            const sectorQ = req.query.sector || "";
            const page = Math.max(1, parseInt(String((_a = req.query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
            const pageSize = Math.min(100, Math.max(1, parseInt(String((_b = req.query.pageSize) !== null && _b !== void 0 ? _b : "20"), 10) || 20));
            const sortByRaw = req.query.sortBy || "createdAt";
            const sortBy = SORTABLE_FIELDS.has(sortByRaw) ? sortByRaw : "createdAt";
            const order = (req.query.order === "asc" ? "asc" : "desc");
            const where = {
                AND: [
                    q
                        ? {
                            OR: [
                                { symbol: { contains: q, mode: "insensitive" } },
                                { description: { contains: q, mode: "insensitive" } },
                                { sector: { contains: q, mode: "insensitive" } },
                            ],
                        }
                        : {},
                    sectorQ ? { sector: { contains: sectorQ, mode: "insensitive" } } : {},
                ],
            };
            const [total, items] = yield db_1.db.$transaction([
                db_1.db.asset.count({ where }),
                db_1.db.asset.findMany({
                    where,
                    orderBy: { [sortBy]: order },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                }),
            ]);
            return res.status(200).json({
                data: items,
                meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
                error: null,
            });
        }
        catch (error) {
            console.error("listAssets error:", error);
            return res.status(500).json({ data: null, error: "Failed to list assets" });
        }
    });
}
function getAssetById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const asset = yield db_1.db.asset.findUnique({ where: { id } });
            if (!asset)
                return res.status(404).json({ data: null, error: "Asset not found" });
            return res.status(200).json({ data: asset, error: null });
        }
        catch (error) {
            console.error("getAssetById error:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch asset" });
        }
    });
}
function getAssetBySymbol(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const symbol = normalizeSymbol(req.params.symbol || "");
            if (!symbol)
                return res.status(400).json({ data: null, error: "Symbol is required" });
            const asset = yield db_1.db.asset.findUnique({ where: { symbol } });
            if (!asset)
                return res.status(404).json({ data: null, error: "Asset not found" });
            return res.status(200).json({ data: asset, error: null });
        }
        catch (error) {
            console.error("getAssetBySymbol error:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch asset" });
        }
    });
}
function createAsset(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { symbol, description, sector, assetClass, defaultAllocationPercentage, defaultCostPerShare, closePrice, } = req.body;
            const sym = (_a = symbol === null || symbol === void 0 ? void 0 : symbol.trim()) === null || _a === void 0 ? void 0 : _a.toUpperCase();
            if (!sym || !description || !sector) {
                return res.status(400).json({
                    data: null,
                    error: "symbol, description, and sector are required",
                });
            }
            const alloc = defaultAllocationPercentage
                ? Math.min(Math.max(Number(defaultAllocationPercentage), 0), 100)
                : 0;
            const cps = defaultCostPerShare ? Math.max(0, Number(defaultCostPerShare)) : 0;
            const close = closePrice ? Math.max(0, Number(closePrice)) : 0;
            const created = yield db_1.db.asset.create({
                data: {
                    symbol: sym,
                    description: description.trim(),
                    sector: sector.trim(),
                    assetClass: assetClass !== null && assetClass !== void 0 ? assetClass : undefined,
                    defaultAllocationPercentage: alloc,
                    defaultCostPerShare: cps,
                    closePrice: close,
                },
            });
            return res.status(201).json({
                data: created,
                error: null,
            });
        }
        catch (error) {
            console.error("createAsset error:", error);
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({
                    data: null,
                    error: "Asset symbol already exists",
                });
            }
            return res.status(500).json({
                data: null,
                error: "Failed to create asset",
            });
        }
    });
}
function updateAsset(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const exists = yield db_1.db.asset.findUnique({ where: { id } });
            if (!exists)
                return res.status(404).json({ data: null, error: "Asset not found" });
            const { symbol, description, sector, assetClass, defaultAllocationPercentage, defaultCostPerShare, closePrice, } = req.body;
            const patch = {};
            if (symbol !== undefined) {
                const sym = normalizeSymbol(symbol);
                if (!sym)
                    return res.status(400).json({ data: null, error: "symbol cannot be empty" });
                patch.symbol = sym;
            }
            if (description !== undefined) {
                if (!description)
                    return res.status(400).json({ data: null, error: "description cannot be empty" });
                patch.description = description;
            }
            if (sector !== undefined) {
                if (!sector)
                    return res.status(400).json({ data: null, error: "sector cannot be empty" });
                patch.sector = sector;
            }
            if (assetClass !== undefined) {
                patch.assetClass = assetClass;
            }
            if (defaultAllocationPercentage !== undefined) {
                patch.defaultAllocationPercentage = clamp(num(defaultAllocationPercentage, 0), 0, 100);
            }
            if (defaultCostPerShare !== undefined) {
                patch.defaultCostPerShare = Math.max(0, num(defaultCostPerShare, 0));
            }
            if (closePrice !== undefined) {
                patch.closePrice = Math.max(0, num(closePrice, 0));
            }
            if (Object.keys(patch).length === 0) {
                return res.status(200).json({ data: exists, error: null });
            }
            const updated = yield db_1.db.asset.update({ where: { id }, data: patch });
            res.status(200).json({ data: updated, error: null });
            if (patch.closePrice !== undefined) {
                cascadeClosePriceUpdate(id, Number(patch.closePrice)).catch((err) => console.error(`[cascadeClosePriceUpdate] assetId=${id}`, err));
            }
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Asset symbol already exists" });
            }
            console.error("updateAsset error:", error);
            return res.status(500).json({ data: null, error: "Failed to update asset" });
        }
    });
}
function cascadeClosePriceUpdate(assetId, newClosePrice) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`[cascade] starting closePrice cascade for assetId=${assetId}, newClosePrice=${newClosePrice}`);
        const [portfolioAssets, userAssets] = yield Promise.all([
            db_1.db.portfolioAsset.findMany({
                where: { assetId },
                select: { id: true, stock: true, costPrice: true },
            }),
            db_1.db.userPortfolioAsset.findMany({
                where: { assetId },
                select: { id: true, stock: true, costPrice: true, userPortfolioId: true },
            }),
        ]);
        yield Promise.all(portfolioAssets.map((pa) => {
            var _a;
            const closeValue = newClosePrice * Number(pa.stock);
            return db_1.db.portfolioAsset.update({
                where: { id: pa.id },
                data: {
                    closeValue,
                    lossGain: closeValue - Number((_a = pa.costPrice) !== null && _a !== void 0 ? _a : 0),
                },
            });
        }));
        yield Promise.all(userAssets.map((ua) => {
            var _a;
            const closeValue = newClosePrice * Number(ua.stock);
            return db_1.db.userPortfolioAsset.update({
                where: { id: ua.id },
                data: {
                    closeValue,
                    lossGain: closeValue - Number((_a = ua.costPrice) !== null && _a !== void 0 ? _a : 0),
                },
            });
        }));
        const affectedUserPortfolioIds = [...new Set(userAssets.map((ua) => ua.userPortfolioId))];
        yield Promise.all(affectedUserPortfolioIds.map((upId) => __awaiter(this, void 0, void 0, function* () {
            const rows = yield db_1.db.userPortfolioAsset.findMany({
                where: { userPortfolioId: upId },
                select: { closeValue: true },
            });
            const total = rows.reduce((s, r) => { var _a; return s + Number((_a = r.closeValue) !== null && _a !== void 0 ? _a : 0); }, 0);
            return db_1.db.userPortfolio.update({
                where: { id: upId },
                data: { portfolioValue: total },
            });
        })));
        console.log(`[cascade] done — updated ${portfolioAssets.length} portfolioAssets, ` +
            `${userAssets.length} userPortfolioAssets, ` +
            `${affectedUserPortfolioIds.length} userPortfolios`);
    });
}
function deleteAsset(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const inUse = yield db_1.db.userPortfolioAsset.count({ where: { assetId: id } });
            if (inUse > 0) {
                return res
                    .status(409)
                    .json({
                    data: null,
                    error: `Cannot delete: asset is referenced by ${inUse} user portfolio(s)`
                });
            }
            const inPortfolio = yield db_1.db.portfolioAsset.count({ where: { assetId: id } });
            if (inPortfolio > 0) {
                return res
                    .status(409)
                    .json({
                    data: null,
                    error: `Cannot delete: asset is referenced by ${inPortfolio} portfolio(s)`
                });
            }
            yield db_1.db.asset.delete({ where: { id } });
            return res.status(200).json({ data: null, error: null, message: "Asset deleted" });
        }
        catch (error) {
            console.error("deleteAsset error:", error);
            return res.status(500).json({ data: null, error: "Failed to delete asset" });
        }
    });
}
function batchUpdateAssetPrices(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { updates } = req.body;
            if (!updates || !Array.isArray(updates) || updates.length === 0) {
                return res.status(400).json({
                    data: null,
                    error: "updates array is required with at least one price update",
                });
            }
            const results = yield db_1.db.$transaction(updates.map((update) => db_1.db.asset.update({
                where: { id: update.assetId },
                data: { closePrice: Math.max(0, Number(update.closePrice)) },
            })));
            return res.status(200).json({
                data: results,
                message: `Updated ${results.length} asset prices`,
                note: "User portfolios will be recalculated on next deposit/withdrawal or manual recompute.",
                error: null,
            });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2025") {
                return res.status(404).json({ data: null, error: "One or more assets not found" });
            }
            console.error("batchUpdateAssetPrices error:", error);
            return res.status(500).json({ data: null, error: "Failed to batch update asset prices" });
        }
    });
}
