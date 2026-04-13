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
exports.createUserPortfolio = createUserPortfolio;
exports.listUserPortfolios = listUserPortfolios;
exports.getUserPortfolioById = getUserPortfolioById;
exports.updateUserPortfolio = updateUserPortfolio;
exports.recomputeUserPortfolio = recomputeUserPortfolio;
exports.deleteUserPortfolio = deleteUserPortfolio;
const db_1 = require("../db/db");
function toNumber(v, fallback = 0) {
    const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : fallback;
}
function parseInclude(q) {
    var _a;
    const raw = ((_a = q.include) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
    const includeUser = set.has("user") || set.has("member") ||
        q.includeUser === "1" || q.includeUser === "true";
    const includePortfolio = set.has("portfolio") ||
        q.includePortfolio === "1" || q.includePortfolio === "true";
    const includeUserAssets = set.has("userassets") || set.has("assets") ||
        q.includeUserAssets === "1" || q.includeUserAssets === "true";
    const includeSubPortfolios = set.has("subportfolios") || set.has("subs") ||
        q.includeSubPortfolios === "1" || q.includeSubPortfolios === "true";
    const includeWallet = set.has("wallet") ||
        q.includeWallet === "1" || q.includeWallet === "true";
    const include = {};
    if (includeUser) {
        include.user = {
            select: {
                id: true, firstName: true, lastName: true, name: true,
                email: true, phone: true, role: true, status: true,
                masterWallet: {
                    select: {
                        id: true, accountNumber: true,
                        netAssetValue: true, totalDeposited: true,
                        totalWithdrawn: true, totalFees: true, status: true,
                    },
                },
            },
        };
    }
    if (includePortfolio) {
        include.portfolio = {
            include: { assets: { include: { asset: true } } },
        };
    }
    if (includeUserAssets) {
        include.userAssets = { include: { asset: true } };
    }
    if (includeSubPortfolios) {
        include.subPortfolios = {
            orderBy: { generation: "asc" },
            include: { assets: { include: { asset: true } } },
        };
    }
    if (includeWallet) {
        include.wallet = true;
    }
    return Object.keys(include).length ? include : undefined;
}
const DEFAULT_INCLUDE = {
    user: {
        select: {
            id: true, firstName: true, lastName: true, name: true,
            email: true, phone: true,
            masterWallet: {
                select: {
                    id: true, accountNumber: true,
                    netAssetValue: true, status: true,
                },
            },
        },
    },
    portfolio: { include: { assets: { include: { asset: true } } } },
    userAssets: { include: { asset: true } },
    wallet: true,
    subPortfolios: {
        orderBy: { generation: "asc" },
        include: { assets: { include: { asset: true } } },
    },
};
function computeUPA(nav, userAllocPercent, userCostPerShare, currentClosePrice) {
    const costPrice = (userAllocPercent / 100) * nav;
    const stock = userCostPerShare > 0 ? costPrice / userCostPerShare : 0;
    const closeValue = currentClosePrice * stock;
    const lossGain = closeValue - costPrice;
    return { costPrice, stock, closeValue, lossGain };
}
function recomputeUPAsFor(userPortfolioId_1) {
    return __awaiter(this, arguments, void 0, function* (userPortfolioId, client = db_1.db) {
        var _a;
        const up = yield client.userPortfolio.findUnique({
            where: { id: userPortfolioId },
            include: {
                wallet: true,
                userAssets: { include: { asset: { select: { id: true, closePrice: true } } } },
            },
        });
        if (!up)
            throw new Error("UserPortfolio not found.");
        if (!up.wallet)
            throw new Error("Portfolio wallet not found.");
        const nav = toNumber(up.wallet.netAssetValue, 0);
        let totalPortfolioValue = 0;
        let totalCostPrice = 0;
        for (const ua of up.userAssets) {
            const { costPrice, stock, closeValue, lossGain } = computeUPA(nav, toNumber(ua.allocationPercentage, 0), toNumber(ua.costPerShare, 0), toNumber((_a = ua.asset) === null || _a === void 0 ? void 0 : _a.closePrice, 0));
            yield client.userPortfolioAsset.update({
                where: { id: ua.id },
                data: { costPrice, stock, closeValue, lossGain },
            });
            totalPortfolioValue += closeValue;
            totalCostPrice += costPrice;
        }
        const totalInvested = nav + toNumber(up.wallet.totalFees, 0);
        yield client.userPortfolio.update({
            where: { id: up.id },
            data: {
                portfolioValue: totalPortfolioValue,
                totalInvested,
                totalLossGain: totalPortfolioValue - totalInvested,
            },
        });
        return { count: up.userAssets.length, totalPortfolioValue };
    });
}
function syncMasterWallet(client, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const wallets = yield client.portfolioWallet.findMany({
            where: { userPortfolio: { userId } },
            select: { netAssetValue: true },
        });
        const totalNav = wallets.reduce((sum, w) => sum + toNumber(w.netAssetValue, 0), 0);
        yield client.masterWallet.updateMany({
            where: { userId },
            data: { netAssetValue: totalNav },
        });
    });
}
function createUserPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userId, portfolioId, customName, amountInvested, bankFee: bankFeeInput, transactionFee: transactionFeeInput, feeAtBank: feeAtBankInput, assetAllocations, } = req.body;
            if (!userId || !portfolioId || !(customName === null || customName === void 0 ? void 0 : customName.trim())) {
                return res.status(400).json({
                    data: null,
                    error: "userId, portfolioId and customName are required.",
                });
            }
            if (!(assetAllocations === null || assetAllocations === void 0 ? void 0 : assetAllocations.length)) {
                return res.status(400).json({
                    data: null,
                    error: "assetAllocations array is required with at least one asset.",
                });
            }
            const investedAmt = toNumber(amountInvested, 0);
            const bankFee = toNumber(bankFeeInput, 30);
            const transactionFee = toNumber(transactionFeeInput, 10);
            const feeAtBank = toNumber(feeAtBankInput, 10);
            for (const a of assetAllocations) {
                if (!a.assetId) {
                    return res.status(400).json({ data: null, error: "Each allocation must have an assetId." });
                }
                if (typeof a.allocationPercentage !== "number" || a.allocationPercentage < 0) {
                    return res.status(400).json({ data: null, error: "allocationPercentage must be >= 0." });
                }
                if (typeof a.costPerShare !== "number" || a.costPerShare < 0) {
                    return res.status(400).json({ data: null, error: "costPerShare must be >= 0." });
                }
            }
            const [user, portfolio] = yield Promise.all([
                db_1.db.user.findUnique({ where: { id: userId }, select: { id: true, masterWallet: { select: { id: true } } } }),
                db_1.db.portfolio.findUnique({ where: { id: portfolioId } }),
            ]);
            if (!user)
                return res.status(404).json({ data: null, error: "User not found." });
            if (!user.masterWallet) {
                return res.status(400).json({ data: null, error: "User master wallet not found." });
            }
            if (!portfolio)
                return res.status(404).json({ data: null, error: "Portfolio not found." });
            const nameConflict = yield db_1.db.userPortfolio.findFirst({
                where: { userId, portfolioId, customName: customName.trim() },
                select: { id: true },
            });
            if (nameConflict) {
                return res.status(409).json({
                    data: null,
                    error: `You already have a portfolio named "${customName.trim()}" for this fund.`,
                });
            }
            const assetIds = assetAllocations.map((a) => a.assetId);
            const assets = yield db_1.db.asset.findMany({
                where: { id: { in: assetIds } },
                select: { id: true, closePrice: true },
            });
            const assetMap = new Map(assets.map((a) => [a.id, a]));
            for (const a of assetAllocations) {
                if (!assetMap.has(a.assetId)) {
                    return res.status(404).json({ data: null, error: `Asset ${a.assetId} not found.` });
                }
            }
            const totalFees = bankFee + transactionFee + feeAtBank;
            const navAmt = investedAmt - totalFees;
            const rows = assetAllocations.map((a) => {
                const closePrice = toNumber(assetMap.get(a.assetId).closePrice, 0);
                const { costPrice, stock, closeValue, lossGain } = computeUPA(navAmt, a.allocationPercentage, a.costPerShare, closePrice);
                return Object.assign(Object.assign({}, a), { costPrice, stock, closeValue, lossGain, closePrice });
            });
            const totalCloseValue = rows.reduce((s, r) => s + r.closeValue, 0);
            const cashAtBank = investedAmt - rows.reduce((s, r) => s + r.costPrice, 0);
            const upId = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const up = yield tx.userPortfolio.create({
                    data: {
                        userId,
                        portfolioId,
                        customName: customName.trim(),
                        portfolioValue: totalCloseValue,
                        totalInvested: investedAmt,
                        totalLossGain: totalCloseValue - investedAmt,
                    },
                });
                const accountNumber = `GKP${Date.now().toString().slice(-7)}`;
                yield tx.portfolioWallet.create({
                    data: {
                        accountNumber,
                        userPortfolioId: up.id,
                        balance: investedAmt,
                        bankFee,
                        transactionFee,
                        feeAtBank,
                        totalFees,
                        netAssetValue: navAmt,
                        status: "ACTIVE",
                    },
                });
                const sub = yield tx.subPortfolio.create({
                    data: {
                        userPortfolioId: up.id,
                        generation: 0,
                        label: `${customName.trim()} - Initial`,
                        amountInvested: investedAmt,
                        totalCostPrice: rows.reduce((s, r) => s + r.costPrice, 0),
                        totalCloseValue,
                        totalLossGain: totalCloseValue - investedAmt,
                        bankFee,
                        transactionFee,
                        feeAtBank,
                        totalFees,
                        cashAtBank,
                        snapshotDate: new Date(),
                    },
                });
                yield tx.subPortfolioAsset.createMany({
                    data: rows.map((r) => ({
                        subPortfolioId: sub.id,
                        assetId: r.assetId,
                        allocationPercentage: r.allocationPercentage,
                        costPerShare: r.costPerShare,
                        costPrice: r.costPrice,
                        stock: r.stock,
                        closePrice: r.closePrice,
                        closeValue: r.closeValue,
                        lossGain: r.lossGain,
                    })),
                    skipDuplicates: true,
                });
                yield tx.userPortfolioAsset.createMany({
                    data: rows.map((r) => ({
                        userPortfolioId: up.id,
                        assetId: r.assetId,
                        allocationPercentage: r.allocationPercentage,
                        costPerShare: r.costPerShare,
                        costPrice: r.costPrice,
                        stock: r.stock,
                        closeValue: r.closeValue,
                        lossGain: r.lossGain,
                    })),
                    skipDuplicates: true,
                });
                if (investedAmt > 0) {
                    yield tx.masterWallet.update({
                        where: { userId },
                        data: { netAssetValue: { increment: totalCloseValue } },
                    });
                }
                return up.id;
            }), { timeout: 20000, maxWait: 5000 });
            const result = yield db_1.db.userPortfolio.findUnique({
                where: { id: upId },
                include: DEFAULT_INCLUDE,
            });
            return res.status(201).json({ data: result, error: null });
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Portfolio name already taken for this user and fund." });
            }
            console.error("createUserPortfolio error:", err);
            return res.status(500).json({
                data: null,
                error: (err === null || err === void 0 ? void 0 : err.code) === "P2028"
                    ? "Operation timed out. Please try again."
                    : "Failed to create user-portfolio.",
            });
        }
    });
}
function listUserPortfolios(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { userId, portfolioId, isActive } = req.query;
            const where = Object.assign(Object.assign(Object.assign({}, (userId ? { userId } : {})), (portfolioId ? { portfolioId } : {})), (isActive !== undefined ? { isActive: isActive === "true" } : {}));
            const items = yield db_1.db.userPortfolio.findMany({
                where: Object.keys(where).length ? where : undefined,
                orderBy: { createdAt: "desc" },
                include: (_a = parseInclude(req.query)) !== null && _a !== void 0 ? _a : DEFAULT_INCLUDE,
            });
            return res.status(200).json({ data: items, error: null });
        }
        catch (err) {
            console.error("listUserPortfolios error:", err);
            return res.status(500).json({ data: null, error: "Failed to load user-portfolios." });
        }
    });
}
function getUserPortfolioById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { id } = req.params;
            if (!id)
                return res.status(400).json({ data: null, error: "Missing id." });
            const include = (_a = parseInclude(req.query)) !== null && _a !== void 0 ? _a : DEFAULT_INCLUDE;
            let portfolio = yield db_1.db.userPortfolio.findUnique({ where: { id }, include });
            if (!portfolio) {
                portfolio = yield db_1.db.userPortfolio.findFirst({
                    where: { portfolioId: id },
                    include,
                });
            }
            if (!portfolio) {
                return res.status(404).json({ data: null, error: "Portfolio not found." });
            }
            return res.status(200).json({ data: portfolio, error: null });
        }
        catch (err) {
            console.error("getUserPortfolioById error:", err);
            return res.status(500).json({ data: null, error: "Failed to load user portfolio." });
        }
    });
}
function updateUserPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            if (!id)
                return res.status(400).json({ data: null, error: "Missing id." });
            const { customName, recompute, assetAllocations, isActive } = req.body;
            const current = yield db_1.db.userPortfolio.findUnique({
                where: { id },
                include: { wallet: true },
            });
            if (!current)
                return res.status(404).json({ data: null, error: "UserPortfolio not found." });
            const updated = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                if ((customName === null || customName === void 0 ? void 0 : customName.trim()) && customName.trim() !== current.customName) {
                    const conflict = yield tx.userPortfolio.findFirst({
                        where: { userId: current.userId, portfolioId: current.portfolioId, customName: customName.trim(), NOT: { id } },
                        select: { id: true },
                    });
                    if (conflict)
                        throw new Error("DUPLICATE_CUSTOM_NAME");
                    yield tx.userPortfolio.update({ where: { id }, data: { customName: customName.trim() } });
                }
                if (isActive !== undefined) {
                    yield tx.userPortfolio.update({ where: { id }, data: { isActive } });
                }
                if (assetAllocations === null || assetAllocations === void 0 ? void 0 : assetAllocations.length) {
                    const nav = toNumber((_a = current.wallet) === null || _a === void 0 ? void 0 : _a.netAssetValue, 0);
                    const assetIds = assetAllocations.map((a) => a.assetId);
                    const assets = yield tx.asset.findMany({
                        where: { id: { in: assetIds } },
                        select: { id: true, closePrice: true },
                    });
                    const assetMap = new Map(assets.map((a) => [a.id, a]));
                    for (const a of assetAllocations) {
                        const asset = assetMap.get(a.assetId);
                        if (!asset)
                            continue;
                        const { costPrice, stock, closeValue, lossGain } = computeUPA(nav, a.allocationPercentage, a.costPerShare, toNumber(asset.closePrice, 0));
                        yield tx.userPortfolioAsset.upsert({
                            where: { userPortfolioId_assetId: { userPortfolioId: id, assetId: a.assetId } },
                            update: { allocationPercentage: a.allocationPercentage, costPerShare: a.costPerShare, costPrice, stock, closeValue, lossGain },
                            create: { userPortfolioId: id, assetId: a.assetId, allocationPercentage: a.allocationPercentage, costPerShare: a.costPerShare, costPrice, stock, closeValue, lossGain },
                        });
                    }
                    const allAssets = yield tx.userPortfolioAsset.findMany({
                        where: { userPortfolioId: id },
                        select: { closeValue: true, costPrice: true },
                    });
                    const totalClose = allAssets.reduce((s, a) => s + toNumber(a.closeValue, 0), 0);
                    const totalCost = allAssets.reduce((s, a) => s + toNumber(a.costPrice, 0), 0);
                    const walletTotalFees = toNumber((_b = current.wallet) === null || _b === void 0 ? void 0 : _b.totalFees, 0);
                    const totalInvested = totalCost + walletTotalFees;
                    yield tx.userPortfolio.update({
                        where: { id },
                        data: { portfolioValue: totalClose, totalInvested, totalLossGain: totalClose - totalInvested },
                    });
                }
                if (recompute) {
                    yield recomputeUPAsFor(id, tx);
                }
                yield syncMasterWallet(tx, current.userId);
                return tx.userPortfolio.findUnique({
                    where: { id },
                    include: (_c = parseInclude(req.query)) !== null && _c !== void 0 ? _c : DEFAULT_INCLUDE,
                });
            }));
            return res.status(200).json({ data: updated, error: null });
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.message) === "DUPLICATE_CUSTOM_NAME") {
                return res.status(409).json({ data: null, error: "You already have a portfolio with that name for this fund." });
            }
            if ((err === null || err === void 0 ? void 0 : err.code) === "P2025") {
                return res.status(404).json({ data: null, error: "UserPortfolio not found." });
            }
            if ((err === null || err === void 0 ? void 0 : err.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Duplicate portfolio name." });
            }
            console.error("updateUserPortfolio error:", err);
            return res.status(500).json({ data: null, error: "Failed to update user-portfolio." });
        }
    });
}
function recomputeUserPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            if (!id)
                return res.status(400).json({ data: null, error: "Missing id." });
            const exists = yield db_1.db.userPortfolio.findUnique({
                where: { id },
                select: { id: true, userId: true },
            });
            if (!exists)
                return res.status(404).json({ data: null, error: "UserPortfolio not found." });
            const result = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const r = yield recomputeUPAsFor(id, tx);
                yield syncMasterWallet(tx, exists.userId);
                const fresh = yield tx.userPortfolio.findUnique({
                    where: { id },
                    include: (_a = parseInclude(req.query)) !== null && _a !== void 0 ? _a : DEFAULT_INCLUDE,
                });
                return { r, fresh };
            }));
            return res.status(200).json({
                data: { recompute: result.r, userPortfolio: result.fresh },
                error: null,
            });
        }
        catch (err) {
            console.error("recomputeUserPortfolio error:", err);
            return res.status(500).json({ data: null, error: "Failed to recompute user-portfolio." });
        }
    });
}
function deleteUserPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            if (!id)
                return res.status(400).json({ data: null, error: "Missing id." });
            const up = yield db_1.db.userPortfolio.findUnique({
                where: { id },
                select: { id: true, userId: true },
            });
            if (!up)
                return res.status(404).json({ data: null, error: "UserPortfolio not found." });
            yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.userPortfolioAsset.deleteMany({ where: { userPortfolioId: id } });
                yield tx.userPortfolio.delete({ where: { id } });
                yield syncMasterWallet(tx, up.userId);
            }));
            return res.status(200).json({ data: null, error: null, message: "UserPortfolio deleted." });
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === "P2025") {
                return res.status(404).json({ data: null, error: "UserPortfolio not found." });
            }
            console.error("deleteUserPortfolio error:", err);
            return res.status(500).json({ data: null, error: "Failed to delete user-portfolio." });
        }
    });
}
