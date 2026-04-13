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
function recomputePortfolioFromNav(tx, userPortfolioId, newNetAssetValue) {
    return __awaiter(this, void 0, void 0, function* () {
        const userPortfolio = yield tx.userPortfolio.findUnique({
            where: { id: userPortfolioId },
            include: { userAssets: { include: { asset: { select: { id: true, closePrice: true } } } } },
        });
        if (!userPortfolio)
            return;
        let totalPortfolioValue = 0;
        let totalCostPrice = 0;
        for (const ua of userPortfolio.userAssets) {
            const costPrice = (ua.allocationPercentage / 100) * newNetAssetValue;
            const stock = ua.costPerShare > 0 ? costPrice / ua.costPerShare : 0;
            const closeValue = ua.asset.closePrice * stock;
            const lossGain = closeValue - costPrice;
            yield tx.userPortfolioAsset.update({
                where: { id: ua.id },
                data: { costPrice, stock, closeValue, lossGain },
            });
            totalPortfolioValue += closeValue;
            totalCostPrice += costPrice;
        }
        yield tx.userPortfolio.update({
            where: { id: userPortfolioId },
            data: {
                portfolioValue: totalPortfolioValue,
                totalInvested: totalCostPrice,
                totalLossGain: totalPortfolioValue - totalCostPrice,
            },
        });
    });
}
function syncMasterWalletNav(tx, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const wallets = yield tx.portfolioWallet.findMany({
            where: { userPortfolio: { userId } },
            select: { netAssetValue: true },
        });
        const totalNav = wallets.reduce((sum, w) => sum + w.netAssetValue, 0);
        yield tx.masterWallet.updateMany({
            where: { userId },
            data: { netAssetValue: totalNav },
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
            let resolvedPortfolioWalletId = null;
            let resolvedUserPortfolioId = userPortfolioId !== null && userPortfolioId !== void 0 ? userPortfolioId : null;
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
                        userPortfolioId: resolvedUserPortfolioId,
                        portfolioWalletId: resolvedPortfolioWalletId,
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
                include: {
                    userAssets: { include: { asset: { select: { id: true, closePrice: true } } } },
                    subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
                    wallet: { select: { id: true, netAssetValue: true, balance: true } },
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
            resolvedPortfolioWalletId = portfolioWalletId !== null && portfolioWalletId !== void 0 ? portfolioWalletId : up.wallet.id;
            const totalCloseValue = up.userAssets.reduce((sum, ua) => sum + ua.closeValue, 0);
            if (totalCloseValue < amt) {
                return res.status(400).json({
                    data: null,
                    error: `Insufficient portfolio close value. Available: ${totalCloseValue.toFixed(2)}`,
                });
            }
            const newNAV = totalCloseValue - amt;
            const totalCostPrice = up.userAssets.reduce((sum, ua) => sum + ua.costPrice, 0);
            const nextGeneration = ((_e = (_d = up.subPortfolios[0]) === null || _d === void 0 ? void 0 : _d.generation) !== null && _e !== void 0 ? _e : 0) + 1;
            const created = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const withdrawal = yield tx.withdrawal.create({
                    data: {
                        userId,
                        userPortfolioId: userPortfolioId,
                        portfolioWalletId: resolvedPortfolioWalletId,
                        masterWalletId: resolvedMasterWalletId,
                        withdrawalType: wType,
                        amount: amt,
                        referenceNo,
                        transactionId: transactionId !== null && transactionId !== void 0 ? transactionId : null,
                        transactionStatus: "APPROVED",
                        approvedAt: new Date(),
                        method: method !== null && method !== void 0 ? method : null,
                        accountNo: accountNo !== null && accountNo !== void 0 ? accountNo : null,
                        accountName: accountName !== null && accountName !== void 0 ? accountName : null,
                        bankName: "",
                        bankAccountName: "",
                        bankBranch: "",
                        description: description !== null && description !== void 0 ? description : null,
                        createdById: createdById !== null && createdById !== void 0 ? createdById : null,
                        createdByName: createdByName !== null && createdByName !== void 0 ? createdByName : null,
                        createdByRole: (_a = createdByRole) !== null && _a !== void 0 ? _a : null,
                    },
                });
                const redemptionSub = yield tx.subPortfolio.create({
                    data: {
                        userPortfolioId,
                        generation: nextGeneration,
                        label: `${up.customName} - Redemption`,
                        amountInvested: 0,
                        totalCostPrice,
                        totalCloseValue,
                        totalLossGain: totalCloseValue - totalCostPrice,
                        bankFee: 0,
                        transactionFee: 0,
                        feeAtBank: 0,
                        totalFees: 0,
                        cashAtBank: 0,
                        snapshotDate: new Date(),
                    },
                });
                if (up.userAssets.length > 0) {
                    yield tx.subPortfolioAsset.createMany({
                        data: up.userAssets.map((ua) => ({
                            subPortfolioId: redemptionSub.id,
                            assetId: ua.assetId,
                            allocationPercentage: ua.allocationPercentage,
                            costPerShare: ua.costPerShare,
                            costPrice: ua.costPrice,
                            stock: ua.stock,
                            closePrice: ua.asset.closePrice,
                            closeValue: ua.closeValue,
                            lossGain: ua.lossGain,
                        })),
                        skipDuplicates: true,
                    });
                }
                yield tx.portfolioWallet.update({
                    where: { id: up.wallet.id },
                    data: {
                        balance: { decrement: amt },
                        netAssetValue: newNAV,
                    },
                });
                yield tx.masterWallet.updateMany({
                    where: { userId },
                    data: { balance: { increment: amt } },
                });
                yield recomputePortfolioFromNav(tx, userPortfolioId, newNAV);
                yield syncMasterWalletNav(tx, userId);
                return withdrawal;
            }), { timeout: 30000, maxWait: 35000 });
            res.status(201).json({ data: created, error: null });
            if (wType === "REDEMPTION" && userPortfolioId) {
                (0, portfolio_performance_report_1.regenerateReportForPortfolio)(userPortfolioId).catch((err) => console.error(`[regenerateReport] createWithdrawal REDEMPTION failed for ${userPortfolioId}:`, err));
            }
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
            const { amount, transactionId, method, accountNo, accountName, bankName, bankAccountName, bankBranch, description, transactionStatus, } = req.body;
            if (transactionStatus && asStatus(transactionStatus) !== "PENDING") {
                return res.status(400).json({ data: null, error: "Use approve/reject endpoints to change status" });
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
            const { approvedById, approvedByName, transactionId } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
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
            if (existing.withdrawalType === "HARD_WITHDRAWAL" && !(transactionId === null || transactionId === void 0 ? void 0 : transactionId.trim())) {
                return res.status(400).json({ data: null, error: "transactionId is required for HARD_WITHDRAWAL approval" });
            }
            if (existing.withdrawalType === "HARD_WITHDRAWAL") {
                const balance = (_c = (_b = existing.masterWallet) === null || _b === void 0 ? void 0 : _b.balance) !== null && _c !== void 0 ? _c : 0;
                if (balance < existing.amount) {
                    return res.status(400).json({
                        data: null,
                        error: `Insufficient master wallet balance. Available: ${balance.toFixed(2)}`,
                    });
                }
            }
            else {
                if (!existing.portfolioWallet) {
                    return res.status(400).json({ data: null, error: "No portfolio wallet linked to this redemption" });
                }
                if (!existing.userPortfolioId) {
                    return res.status(400).json({ data: null, error: "No portfolio linked to this redemption" });
                }
            }
            let redemptionData = null;
            if (existing.withdrawalType === "REDEMPTION") {
                const up = yield db_1.db.userPortfolio.findUnique({
                    where: { id: existing.userPortfolioId },
                    include: {
                        userAssets: { include: { asset: { select: { id: true, closePrice: true } } } },
                        subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
                    },
                });
                if (!up)
                    return res.status(404).json({ data: null, error: "Portfolio not found" });
                const totalCloseValue = up.userAssets.reduce((sum, ua) => sum + ua.closeValue, 0);
                if (totalCloseValue < existing.amount) {
                    return res.status(400).json({
                        data: null,
                        error: `Insufficient portfolio close value. Available: ${totalCloseValue.toFixed(2)}`,
                    });
                }
                redemptionData = { userPortfolioWithAssets: up, totalCloseValue };
            }
            const approved = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                const updatedWithdrawal = yield tx.withdrawal.update({
                    where: { id },
                    data: {
                        transactionStatus: "APPROVED",
                        transactionId: (_a = transactionId === null || transactionId === void 0 ? void 0 : transactionId.trim()) !== null && _a !== void 0 ? _a : null,
                        approvedById: approvedById !== null && approvedById !== void 0 ? approvedById : null,
                        approvedByName: approvedByName !== null && approvedByName !== void 0 ? approvedByName : null,
                        approvedAt: new Date(),
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
                }
                else {
                    const { userPortfolioWithAssets: up, totalCloseValue } = redemptionData;
                    const newNAV = totalCloseValue - existing.amount;
                    const totalCostPrice = up.userAssets.reduce((sum, ua) => sum + ua.costPrice, 0);
                    const nextGeneration = ((_c = (_b = up.subPortfolios[0]) === null || _b === void 0 ? void 0 : _b.generation) !== null && _c !== void 0 ? _c : 0) + 1;
                    const redemptionSub = yield tx.subPortfolio.create({
                        data: {
                            userPortfolioId: existing.userPortfolioId,
                            generation: nextGeneration,
                            label: `${up.customName} - Redemption`,
                            amountInvested: 0,
                            totalCostPrice,
                            totalCloseValue,
                            totalLossGain: totalCloseValue - totalCostPrice,
                            bankFee: 0,
                            transactionFee: 0,
                            feeAtBank: 0,
                            totalFees: 0,
                            cashAtBank: 0,
                            snapshotDate: new Date(),
                        },
                    });
                    if (up.userAssets.length > 0) {
                        yield tx.subPortfolioAsset.createMany({
                            data: up.userAssets.map((ua) => ({
                                subPortfolioId: redemptionSub.id,
                                assetId: ua.assetId,
                                allocationPercentage: ua.allocationPercentage,
                                costPerShare: ua.costPerShare,
                                costPrice: ua.costPrice,
                                stock: ua.stock,
                                closePrice: ua.asset.closePrice,
                                closeValue: ua.closeValue,
                                lossGain: ua.lossGain,
                            })),
                            skipDuplicates: true,
                        });
                    }
                    yield tx.portfolioWallet.update({
                        where: { id: existing.portfolioWallet.id },
                        data: {
                            balance: { decrement: existing.amount },
                            netAssetValue: newNAV,
                        },
                    });
                    yield tx.masterWallet.updateMany({
                        where: { userId: existing.userId },
                        data: { balance: { increment: existing.amount } },
                    });
                    if (existing.userPortfolioId) {
                        yield recomputePortfolioFromNav(tx, existing.userPortfolioId, newNAV);
                    }
                    yield syncMasterWalletNav(tx, existing.userId);
                }
                return updatedWithdrawal;
            }), { timeout: 30000, maxWait: 35000 });
            res.status(200).json({ data: approved, error: null });
            if (existing.withdrawalType === "REDEMPTION" && existing.userPortfolioId) {
                (0, portfolio_performance_report_1.regenerateReportForPortfolio)(existing.userPortfolioId).catch((err) => console.error(`[regenerateReport] approveWithdrawal REDEMPTION failed for ${existing.userPortfolioId}:`, err));
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
