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
exports.createPortfolio = createPortfolio;
exports.listPortfolios = listPortfolios;
exports.getPortfolioById = getPortfolioById;
exports.updatePortfolio = updatePortfolio;
exports.deletePortfolio = deletePortfolio;
const db_1 = require("../db/db");
function toNumber(v, fallback) {
    const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : fallback;
}
function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}
function parseInclude(q) {
    var _a;
    const raw = ((_a = q.include) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
    const includeAssets = set.has("assets") || q.includeAssets === "1" || q.includeAssets === "true";
    const includeMembers = set.has("userportfolios") || set.has("members") ||
        q.includeMembers === "1" || q.includeMembers === "true";
    const include = {};
    if (includeAssets) {
        include.assets = {
            include: {
                asset: {
                    select: {
                        id: true,
                        symbol: true,
                        description: true,
                        sector: true,
                        assetClass: true,
                        defaultAllocationPercentage: true,
                        defaultCostPerShare: true,
                        closePrice: true,
                    },
                },
            },
        };
    }
    if (includeMembers) {
        include.userPortfolios = {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
            include: {
                user: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        name: true,
                        email: true,
                        phone: true,
                        role: true,
                        status: true,
                    },
                },
                wallet: {
                    select: {
                        id: true,
                        accountNumber: true,
                        netAssetValue: true,
                        balance: true,
                        status: true,
                    },
                },
            },
        };
    }
    return Object.keys(include).length ? include : undefined;
}
function createPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { name, description, timeHorizon, riskTolerance, allocationPercentage, } = req.body;
            if (!name || !timeHorizon || !riskTolerance) {
                return res.status(400).json({
                    data: null,
                    error: "name, timeHorizon and riskTolerance are required.",
                });
            }
            const exists = yield db_1.db.portfolio.findUnique({ where: { name }, select: { id: true } });
            if (exists) {
                return res.status(409).json({ data: null, error: "A portfolio with this name already exists." });
            }
            const alloc = clamp(toNumber(allocationPercentage, 100), 0, 100);
            const created = yield db_1.db.portfolio.create({
                data: {
                    name,
                    description: description !== null && description !== void 0 ? description : null,
                    timeHorizon,
                    riskTolerance,
                    allocationPercentage: alloc,
                },
            });
            return res.status(201).json({ data: created, error: null });
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Portfolio name must be unique." });
            }
            console.error("createPortfolio error:", err);
            return res.status(500).json({ data: null, error: "Failed to create portfolio." });
        }
    });
}
function listPortfolios(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const include = parseInclude(req.query);
            const items = yield db_1.db.portfolio.findMany({
                orderBy: { createdAt: "desc" },
                include,
            });
            return res.status(200).json({ data: items, error: null });
        }
        catch (err) {
            console.error("listPortfolios error:", err);
            return res.status(500).json({ data: null, error: "Failed to load portfolios." });
        }
    });
}
function getPortfolioById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            if (!id)
                return res.status(400).json({ data: null, error: "Missing id." });
            const include = parseInclude(req.query);
            const item = yield db_1.db.portfolio.findUnique({ where: { id }, include });
            if (!item)
                return res.status(404).json({ data: null, error: "Portfolio not found." });
            return res.status(200).json({ data: item, error: null });
        }
        catch (err) {
            console.error("getPortfolioById error:", err);
            return res.status(500).json({ data: null, error: "Failed to load portfolio." });
        }
    });
}
function updatePortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            if (!id)
                return res.status(400).json({ data: null, error: "Missing id." });
            const { name, description, timeHorizon, riskTolerance, allocationPercentage } = req.body;
            if (name) {
                const conflict = yield db_1.db.portfolio.findFirst({
                    where: { name, NOT: { id } },
                    select: { id: true },
                });
                if (conflict) {
                    return res.status(409).json({ data: null, error: "A portfolio with this name already exists." });
                }
            }
            const data = {};
            if (name !== undefined)
                data.name = name;
            if (description !== undefined)
                data.description = description;
            if (timeHorizon !== undefined)
                data.timeHorizon = timeHorizon;
            if (riskTolerance !== undefined)
                data.riskTolerance = riskTolerance;
            if (allocationPercentage !== undefined) {
                data.allocationPercentage = clamp(toNumber(allocationPercentage, 100), 0, 100);
            }
            if (!Object.keys(data).length) {
                return res.status(400).json({ data: null, error: "No updatable fields provided." });
            }
            const updated = yield db_1.db.portfolio.update({ where: { id }, data });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === "P2025") {
                return res.status(404).json({ data: null, error: "Portfolio not found." });
            }
            if ((err === null || err === void 0 ? void 0 : err.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Portfolio name must be unique." });
            }
            console.error("updatePortfolio error:", err);
            return res.status(500).json({ data: null, error: "Failed to update portfolio." });
        }
    });
}
function deletePortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            if (!id)
                return res.status(400).json({ data: null, error: "Missing id." });
            const userPortfolios = yield db_1.db.userPortfolio.findMany({
                where: { portfolioId: id },
                select: { id: true },
            });
            const upIds = userPortfolios.map((up) => up.id);
            const subPortfolios = upIds.length
                ? yield db_1.db.subPortfolio.findMany({
                    where: { userPortfolioId: { in: upIds } },
                    select: { id: true },
                })
                : [];
            const subIds = subPortfolios.map((s) => s.id);
            yield db_1.db.$transaction([
                ...(subIds.length
                    ? [db_1.db.subPortfolioAsset.deleteMany({ where: { subPortfolioId: { in: subIds } } })]
                    : []),
                ...(upIds.length
                    ? [db_1.db.subPortfolio.deleteMany({ where: { userPortfolioId: { in: upIds } } })]
                    : []),
                ...(upIds.length
                    ? [db_1.db.userPortfolioAsset.deleteMany({ where: { userPortfolioId: { in: upIds } } })]
                    : []),
                ...(upIds.length
                    ? [db_1.db.portfolioWallet.deleteMany({ where: { userPortfolioId: { in: upIds } } })]
                    : []),
                ...(upIds.length
                    ? [db_1.db.userPortfolio.deleteMany({ where: { portfolioId: id } })]
                    : []),
                db_1.db.portfolioAsset.deleteMany({ where: { portfolioId: id } }),
                db_1.db.portfolio.delete({ where: { id } }),
            ]);
            return res.status(200).json({ data: null, error: null, message: "Portfolio deleted." });
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === "P2025") {
                return res.status(404).json({ data: null, error: "Portfolio not found." });
            }
            console.error("deletePortfolio error:", err);
            return res.status(500).json({ data: null, error: "Failed to delete portfolio." });
        }
    });
}
