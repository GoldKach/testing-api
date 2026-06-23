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
exports.listWithdrawals = listWithdrawals;
exports.getWithdrawalById = getWithdrawalById;
exports.createWithdrawal = createWithdrawal;
exports.updateWithdrawal = updateWithdrawal;
exports.approveWithdrawal = approveWithdrawal;
exports.rejectWithdrawal = rejectWithdrawal;
exports.deleteWithdrawal = deleteWithdrawal;
const db_1 = require("../db/db");
const portfolio_performance_report_1 = require("../controllers/portfolio-performance-report");
function asStatus(v) {
    const s = String(v || "").toUpperCase();
    if (s === "PENDING" || s === "APPROVED" || s === "REJECTED")
        return s;
    return undefined;
}
function num(v, def = 0) {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : def;
}
function parseIncludeParam(raw) {
    const inc = (raw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const include = {};
    if (inc.includes("user"))
        include.user = true;
    if (inc.includes("portfoliowallet"))
        include.portfolioWallet = true;
    if (inc.includes("masterwallet"))
        include.masterWallet = true;
    if (inc.includes("userportfolio"))
        include.userPortfolio = true;
    if (inc.includes("createdby"))
        include.createdBy = true;
    if (inc.includes("approvedby"))
        include.approvedBy = true;
    if (inc.includes("rejectedby"))
        include.rejectedBy = true;
    return include;
}
const SORTABLE_FIELDS = new Set([
    "createdAt", "amount", "transactionStatus", "updatedAt",
]);
function syncMasterWalletNav(tx, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const portfolios = yield tx.userPortfolio.findMany({
            where: { userId },
            select: { portfolioValue: true },
        });
        const totalMarketValue = portfolios.reduce((s, p) => { var _a; return s + Number((_a = p.portfolioValue) !== null && _a !== void 0 ? _a : 0); }, 0);
        yield tx.masterWallet.updateMany({
            where: { userId },
            data: { netAssetValue: totalMarketValue },
        });
    });
}
function listWithdrawals(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const q = req.query.q || "";
            const userId = req.query.userId || "";
            const userPortfolioId = req.query.userPortfolioId || "";
            const portfolioWalletId = req.query.portfolioWalletId || "";
            const masterWalletId = req.query.masterWalletId || "";
            const withdrawalType = req.query.withdrawalType || "";
            const status = asStatus(req.query.status);
            const include = parseIncludeParam(req.query.include);
            const page = Math.max(1, parseInt(String((_a = req.query.page) !== null && _a !== void 0 ? _a : "1"), 10) || 1);
            const pageSize = Math.min(100, Math.max(1, parseInt(String((_b = req.query.pageSize) !== null && _b !== void 0 ? _b : "20"), 10) || 20));
            const sortByRaw = req.query.sortBy || "createdAt";
            const sortBy = SORTABLE_FIELDS.has(sortByRaw) ? sortByRaw : "createdAt";
            const order = (req.query.order === "asc" ? "asc" : "desc");
            const where = {
                AND: [
                    userId ? { userId } : {},
                    userPortfolioId ? { userPortfolioId } : {},
                    portfolioWalletId ? { portfolioWalletId } : {},
                    masterWalletId ? { masterWalletId } : {},
                    withdrawalType ? { withdrawalType: withdrawalType } : {},
                    status ? { transactionStatus: status } : {},
                    q ? {
                        OR: [
                            { referenceNo: { contains: q, mode: "insensitive" } },
                            { method: { contains: q, mode: "insensitive" } },
                            { bankName: { contains: q, mode: "insensitive" } },
                            { accountNo: { contains: q, mode: "insensitive" } },
                            { accountName: { contains: q, mode: "insensitive" } },
                            { createdByName: { contains: q, mode: "insensitive" } },
                        ],
                    } : {},
                ],
            };
            const [total, items] = yield db_1.db.$transaction([
                db_1.db.withdrawal.count({ where }),
                db_1.db.withdrawal.findMany({
                    where,
                    orderBy: { [sortBy]: order },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    include: Object.keys(include).length ? include : undefined,
                }),
            ]);
            return res.status(200).json({
                data: items,
                meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
                error: null,
            });
        }
        catch (error) {
            console.error("listWithdrawals error:", error);
            return res.status(500).json({ data: null, error: "Failed to list withdrawals" });
        }
    });
}
function getWithdrawalById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const include = parseIncludeParam(req.query.include);
            const row = yield db_1.db.withdrawal.findUnique({
                where: { id },
                include: Object.keys(include).length ? include : undefined,
            });
            if (!row)
                return res.status(404).json({ data: null, error: "Withdrawal not found" });
            return res.status(200).json({ data: row, error: null });
        }
        catch (error) {
            console.error("getWithdrawalById error:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch withdrawal" });
        }
    });
}
function createWithdrawal(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        try {
            const { userId, userPortfolioId, portfolioWalletId, masterWalletId, withdrawalType, amount, referenceNo, transactionId, method, accountNo, accountName, bankName, bankAccountName, bankBranch, description, createdById, createdByName, createdByRole, } = req.body;
            const wType = (withdrawalType === "REDEMPTION" ? "REDEMPTION" : "HARD_WITHDRAWAL");
            const amt = num(amount, NaN);
            if (!userId || !referenceNo || !Number.isFinite(amt) || amt <= 0) {
                return res.status(400).json({
                    data: null,
                    error: "userId, referenceNo and a positive amount are required",
                });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { id: true, masterWallet: { select: { id: true, balance: true } } },
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            const resolvedMasterWalletId = (_b = masterWalletId !== null && masterWalletId !== void 0 ? masterWalletId : (_a = user.masterWallet) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
            if (wType === "HARD_WITHDRAWAL") {
                if (!bankName || !bankAccountName || !bankBranch) {
                    return res.status(400).json({
                        data: null,
                        error: "bankName, bankAccountName and bankBranch are required for HARD_WITHDRAWAL",
                    });
                }
                const created = yield db_1.db.withdrawal.create({
                    data: {
                        userId,
                        userPortfolioId: null,
                        portfolioWalletId: null,
                        masterWalletId: resolvedMasterWalletId,
                        withdrawalType: wType,
                        amount: amt,
                        referenceNo,
                        transactionId: transactionId !== null && transactionId !== void 0 ? transactionId : null,
                        transactionStatus: "PENDING",
                        method: method !== null && method !== void 0 ? method : null,
                        accountNo: accountNo !== null && accountNo !== void 0 ? accountNo : null,
                        accountName: accountName !== null && accountName !== void 0 ? accountName : null,
                        bankName: bankName !== null && bankName !== void 0 ? bankName : "",
                        bankAccountName: bankAccountName !== null && bankAccountName !== void 0 ? bankAccountName : "",
                        bankBranch: bankBranch !== null && bankBranch !== void 0 ? bankBranch : "",
                        description: description !== null && description !== void 0 ? description : null,
                        createdById: createdById !== null && createdById !== void 0 ? createdById : null,
                        createdByName: createdByName !== null && createdByName !== void 0 ? createdByName : null,
                        createdByRole: (_c = createdByRole) !== null && _c !== void 0 ? _c : null,
                    },
                });
                return res.status(201).json({ data: created, error: null });
            }
            if (!userPortfolioId) {
                return res.status(400).json({ data: null, error: "userPortfolioId is required for REDEMPTION" });
            }
            const up = yield db_1.db.userPortfolio.findUnique({
                where: { id: userPortfolioId },
                select: {
                    id: true, userId: true,
                    portfolioValue: true,
                    wallet: { select: { id: true } },
                },
            });
            if (!up)
                return res.status(404).json({ data: null, error: "Portfolio not found" });
            if (up.userId !== userId) {
                return res.status(403).json({ data: null, error: "Portfolio does not belong to this user" });
            }
            if (!up.wallet) {
                return res.status(400).json({ data: null, error: "Portfolio wallet not found" });
            }
            const maxRedeemable = Number((_d = up.portfolioValue) !== null && _d !== void 0 ? _d : 0);
            if (amt > maxRedeemable) {
                return res.status(400).json({
                    data: null,
                    error: `Redemption amount exceeds portfolio value. Max redeemable: ${maxRedeemable.toFixed(2)}`,
                });
            }
            const created = yield db_1.db.withdrawal.create({
                data: {
                    userId,
                    userPortfolioId: userPortfolioId,
                    portfolioWalletId: portfolioWalletId !== null && portfolioWalletId !== void 0 ? portfolioWalletId : up.wallet.id,
                    masterWalletId: resolvedMasterWalletId,
                    withdrawalType: wType,
                    amount: amt,
                    referenceNo,
                    transactionId: transactionId !== null && transactionId !== void 0 ? transactionId : null,
                    transactionStatus: "PENDING",
                    method: method !== null && method !== void 0 ? method : null,
                    accountNo: accountNo !== null && accountNo !== void 0 ? accountNo : null,
                    accountName: accountName !== null && accountName !== void 0 ? accountName : null,
                    bankName: "",
                    bankAccountName: "",
                    bankBranch: "",
                    description: description !== null && description !== void 0 ? description : null,
                    createdById: createdById !== null && createdById !== void 0 ? createdById : null,
                    createdByName: createdByName !== null && createdByName !== void 0 ? createdByName : null,
                    createdByRole: (_e = createdByRole) !== null && _e !== void 0 ? _e : null,
                },
            });
            return res.status(201).json({ data: created, error: null });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Duplicate transactionId" });
            }
            console.error("createWithdrawal error:", error);
            return res.status(500).json({ data: null, error: (_f = error === null || error === void 0 ? void 0 : error.message) !== null && _f !== void 0 ? _f : "Failed to create withdrawal" });
        }
    });
}
function updateWithdrawal(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const exists = yield db_1.db.withdrawal.findUnique({ where: { id } });
            if (!exists)
                return res.status(404).json({ data: null, error: "Withdrawal not found" });
            if (exists.transactionStatus !== "PENDING") {
                return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be updated" });
            }
            const { amount, transactionId, method, accountNo, accountName, bankName, bankAccountName, bankBranch, description, createdAt, } = req.body;
            const nonDateFields = [amount, transactionId, method, accountNo, accountName, bankName, bankAccountName, bankBranch, description];
            const hasNonDate = nonDateFields.some((v) => v !== undefined);
            if (hasNonDate && exists.transactionStatus !== "PENDING") {
                return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be updated" });
            }
            const data = {};
            if (amount !== undefined) {
                const a = num(amount, NaN);
                if (!Number.isFinite(a) || a <= 0) {
                    return res.status(400).json({ data: null, error: "amount must be > 0" });
                }
                data.amount = a;
            }
            if (transactionId !== undefined)
                data.transactionId = transactionId;
            if (method !== undefined)
                data.method = method;
            if (accountNo !== undefined)
                data.accountNo = accountNo;
            if (accountName !== undefined)
                data.accountName = accountName;
            if (bankName !== undefined)
                data.bankName = bankName;
            if (bankAccountName !== undefined)
                data.bankAccountName = bankAccountName;
            if (bankBranch !== undefined)
                data.bankBranch = bankBranch;
            if (description !== undefined)
                data.description = description;
            if (createdAt !== undefined) {
                const d = new Date(createdAt);
                if (isNaN(d.getTime()))
                    return res.status(400).json({ data: null, error: "Invalid createdAt date" });
                data.createdAt = d;
            }
            const updated = yield db_1.db.withdrawal.update({ where: { id }, data });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Duplicate transactionId" });
            }
            console.error("updateWithdrawal error:", error);
            return res.status(500).json({ data: null, error: "Failed to update withdrawal" });
        }
    });
}
function approveWithdrawal(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            const { id } = req.params;
            const { approvedById, approvedByName, transactionId, assetPrices, approvedAt } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
            const existing = yield db_1.db.withdrawal.findUnique({
                where: { id },
                include: {
                    portfolioWallet: { select: { id: true, netAssetValue: true, balance: true } },
                    masterWallet: { select: { id: true, balance: true } },
                },
            });
            if (!existing)
                return res.status(404).json({ data: null, error: "Withdrawal not found" });
            if (existing.transactionStatus === "APPROVED") {
                return res.status(200).json({ data: existing, error: null });
            }
            if (existing.transactionStatus === "REJECTED") {
                return res.status(409).json({ data: null, error: "Cannot approve a rejected withdrawal" });
            }
            if (existing.withdrawalType === "HARD_WITHDRAWAL") {
                if (!(transactionId === null || transactionId === void 0 ? void 0 : transactionId.trim())) {
                    return res.status(400).json({ data: null, error: "transactionId is required for HARD_WITHDRAWAL approval" });
                }
                const balance = (_c = (_b = existing.masterWallet) === null || _b === void 0 ? void 0 : _b.balance) !== null && _c !== void 0 ? _c : 0;
                if (balance < existing.amount) {
                    return res.status(400).json({
                        data: null,
                        error: `Insufficient master wallet balance. Available: ${balance.toFixed(2)}`,
                    });
                }
            }
            let redemptionContext = null;
            if (existing.withdrawalType === "REDEMPTION") {
                if (!existing.portfolioWallet) {
                    return res.status(400).json({ data: null, error: "No portfolio wallet linked to this redemption" });
                }
                if (!existing.userPortfolioId) {
                    return res.status(400).json({ data: null, error: "No portfolio linked to this redemption" });
                }
                if (!assetPrices || Object.keys(assetPrices).length === 0) {
                    return res.status(400).json({
                        data: null,
                        error: "assetPrices is required for REDEMPTION approval. Provide the selling close price for each asset.",
                    });
                }
                const up = yield db_1.db.userPortfolio.findUnique({
                    where: { id: existing.userPortfolioId },
                    include: {
                        userAssets: { include: { asset: { select: { id: true, closePrice: true } } } },
                        subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
                        wallet: { select: { id: true, netAssetValue: true, balance: true } },
                    },
                });
                if (!up)
                    return res.status(404).json({ data: null, error: "Portfolio not found" });
                for (const ua of up.userAssets) {
                    if (assetPrices[ua.assetId] === undefined || assetPrices[ua.assetId] <= 0) {
                        return res.status(400).json({
                            data: null,
                            error: `Missing or invalid close price for asset ${ua.assetId}`,
                        });
                    }
                }
                const currentPortfolioValue = up.userAssets.reduce((s, ua) => s + Number(ua.closeValue), 0);
                if (existing.amount > currentPortfolioValue) {
                    return res.status(400).json({
                        data: null,
                        error: `Redemption amount ${existing.amount.toFixed(2)} exceeds portfolio value ${currentPortfolioValue.toFixed(2)}`,
                    });
                }
                redemptionContext = { up: up };
            }
            const approvalDate = approvedAt ? new Date(approvedAt) : new Date();
            const approved = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                const row = yield tx.withdrawal.update({
                    where: { id },
                    data: {
                        transactionStatus: "APPROVED",
                        transactionId: (_a = transactionId === null || transactionId === void 0 ? void 0 : transactionId.trim()) !== null && _a !== void 0 ? _a : null,
                        approvedById: approvedById !== null && approvedById !== void 0 ? approvedById : null,
                        approvedByName: approvedByName !== null && approvedByName !== void 0 ? approvedByName : null,
                        approvedAt: approvalDate,
                    },
                });
                if (existing.withdrawalType === "HARD_WITHDRAWAL") {
                    yield tx.masterWallet.updateMany({
                        where: { userId: existing.userId },
                        data: {
                            balance: { decrement: existing.amount },
                            totalWithdrawn: { increment: existing.amount },
                        },
                    });
                    return row;
                }
                const { up } = redemptionContext;
                const redemptionAmount = existing.amount;
                const nextGeneration = ((_c = (_b = up.subPortfolios[0]) === null || _b === void 0 ? void 0 : _b.generation) !== null && _c !== void 0 ? _c : 0) + 1;
                const newTotalInvested = Math.max(0, Number(up.totalInvested) - redemptionAmount);
                const assetResults = up.userAssets.map((ua) => {
                    const adminClosePrice = assetPrices[ua.assetId];
                    const allocAmount = (ua.allocationPercentage / 100) * redemptionAmount;
                    const stocksSold = adminClosePrice > 0 ? allocAmount / adminClosePrice : 0;
                    const snapCloseValue = adminClosePrice * stocksSold;
                    const snapLossGain = snapCloseValue - allocAmount;
                    const newStock = Math.max(0, Number(ua.stock) - stocksSold);
                    const newCostPrice = (ua.allocationPercentage / 100) * newTotalInvested;
                    const newCostPerShare = newStock > 0 ? newCostPrice / newStock : 0;
                    const newCloseValue = Number(ua.asset.closePrice) * newStock;
                    const newLossGain = newCloseValue - newCostPrice;
                    return {
                        id: ua.id,
                        assetId: ua.assetId,
                        allocationPercentage: ua.allocationPercentage,
                        snap: {
                            stock: stocksSold,
                            costPrice: allocAmount,
                            closePrice: adminClosePrice,
                            closeValue: snapCloseValue,
                            lossGain: snapLossGain,
                        },
                        x2: {
                            stock: newStock,
                            costPrice: newCostPrice,
                            costPerShare: newCostPerShare,
                            closeValue: newCloseValue,
                            lossGain: newLossGain,
                        },
                    };
                });
                const snapTotalCostPrice = assetResults.reduce((s, r) => s + r.snap.costPrice, 0);
                const snapTotalCloseValue = assetResults.reduce((s, r) => s + r.snap.closeValue, 0);
                const redemptionSub = yield tx.subPortfolio.create({
                    data: {
                        userPortfolioId: existing.userPortfolioId,
                        generation: nextGeneration,
                        label: `${up.customName} - Redemption ${nextGeneration}`,
                        amountInvested: redemptionAmount,
                        totalCostPrice: snapTotalCostPrice,
                        totalCloseValue: snapTotalCloseValue,
                        totalLossGain: snapTotalCloseValue - snapTotalCostPrice,
                        bankFee: 0,
                        transactionFee: 0,
                        feeAtBank: 0,
                        totalFees: 0,
                        cashAtBank: 0,
                        snapshotDate: approvalDate,
                    },
                });
                yield tx.subPortfolioAsset.createMany({
                    data: assetResults.map((r) => ({
                        subPortfolioId: redemptionSub.id,
                        assetId: r.assetId,
                        allocationPercentage: r.allocationPercentage,
                        costPerShare: r.snap.closePrice,
                        costPrice: r.snap.costPrice,
                        stock: r.snap.stock,
                        closePrice: r.snap.closePrice,
                        closeValue: r.snap.closeValue,
                        lossGain: r.snap.lossGain,
                    })),
                    skipDuplicates: true,
                });
                for (const r of assetResults) {
                    yield tx.userPortfolioAsset.update({
                        where: { id: r.id },
                        data: {
                            stock: r.x2.stock,
                            costPrice: r.x2.costPrice,
                            costPerShare: r.x2.costPerShare,
                            closeValue: r.x2.closeValue,
                            lossGain: r.x2.lossGain,
                        },
                    });
                }
                const newPortfolioValue = assetResults.reduce((s, r) => s + r.x2.closeValue, 0);
                const newTotalLossGain = newPortfolioValue - newTotalInvested;
                yield tx.userPortfolio.update({
                    where: { id: existing.userPortfolioId },
                    data: {
                        portfolioValue: newPortfolioValue,
                        totalLossGain: newTotalLossGain,
                    },
                });
                yield tx.portfolioWallet.update({
                    where: { id: existing.portfolioWallet.id },
                    data: {
                        balance: { decrement: redemptionAmount },
                        netAssetValue: { decrement: redemptionAmount },
                    },
                });
                yield tx.masterWallet.updateMany({
                    where: { userId: existing.userId },
                    data: {
                        balance: { increment: redemptionAmount },
                    },
                });
                yield syncMasterWalletNav(tx, existing.userId);
                return row;
            }), { timeout: 30000, maxWait: 35000 });
            res.status(200).json({ data: approved, error: null });
            if (existing.withdrawalType === "REDEMPTION" && existing.userPortfolioId) {
                (0, portfolio_performance_report_1.regenerateReportForPortfolio)(existing.userPortfolioId).catch((err) => console.error(`[regenerateReport] REDEMPTION failed for ${existing.userPortfolioId}:`, err));
            }
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Duplicate transactionId" });
            }
            console.error("approveWithdrawal error:", error);
            return res.status(500).json({ data: null, error: "Failed to approve withdrawal" });
        }
    });
}
function rejectWithdrawal(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { id } = req.params;
            const { rejectedById, rejectedByName, reason } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
            const row = yield db_1.db.withdrawal.findUnique({ where: { id } });
            if (!row)
                return res.status(404).json({ data: null, error: "Withdrawal not found" });
            if (row.transactionStatus !== "PENDING") {
                return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be rejected" });
            }
            const updated = yield db_1.db.withdrawal.update({
                where: { id },
                data: {
                    transactionStatus: "REJECTED",
                    rejectedById: rejectedById !== null && rejectedById !== void 0 ? rejectedById : null,
                    rejectedByName: rejectedByName !== null && rejectedByName !== void 0 ? rejectedByName : null,
                    rejectedAt: new Date(),
                    rejectReason: reason !== null && reason !== void 0 ? reason : null,
                },
            });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (error) {
            console.error("rejectWithdrawal error:", error);
            return res.status(500).json({ data: null, error: "Failed to reject withdrawal" });
        }
    });
}
function deleteWithdrawal(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const exists = yield db_1.db.withdrawal.findUnique({ where: { id } });
            if (!exists)
                return res.status(404).json({ data: null, error: "Withdrawal not found" });
            if (exists.transactionStatus !== "PENDING") {
                return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be deleted" });
            }
            yield db_1.db.withdrawal.delete({ where: { id } });
            return res.status(200).json({ data: null, error: null, message: "Withdrawal deleted" });
        }
        catch (error) {
            console.error("deleteWithdrawal error:", error);
            return res.status(500).json({ data: null, error: "Failed to delete withdrawal" });
        }
    });
}
