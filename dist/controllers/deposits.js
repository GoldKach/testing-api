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
exports.listDeposits = listDeposits;
exports.getDepositById = getDepositById;
exports.createDeposit = createDeposit;
exports.updateDeposit = updateDeposit;
exports.approveDeposit = approveDeposit;
exports.rejectDeposit = rejectDeposit;
exports.reverseDeposit = reverseDeposit;
exports.deleteDeposit = deleteDeposit;
exports.getDepositFeeSummary = getDepositFeeSummary;
const db_1 = require("../db/db");
const Status = {
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
};
function num(v, def = 0) {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : def;
}
function asTxStatus(v) {
    if (v == null)
        return undefined;
    const s = String(v).toUpperCase();
    return [Status.PENDING, Status.APPROVED, Status.REJECTED].includes(s) ? s : undefined;
}
const SORTABLE_FIELDS = new Set([
    "createdAt", "amount", "transactionStatus",
]);
const DEPOSIT_INCLUDE = {
    user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
    approvedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
    rejectedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
    portfolioWallet: true,
    masterWallet: true,
    userPortfolio: { select: { id: true, customName: true, portfolioId: true } },
};
function applyTopup(tx_1, depositId_1, userPortfolioId_1, topupAmount_1) {
    return __awaiter(this, arguments, void 0, function* (tx, depositId, userPortfolioId, topupAmount, assetPrices = {}) {
        var _a, _b;
        const up = yield tx.userPortfolio.findUnique({
            where: { id: userPortfolioId },
            include: {
                wallet: true,
                userAssets: { include: { asset: { select: { id: true, closePrice: true } } } },
                subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
            },
        });
        if (!up || !up.wallet)
            throw new Error("UserPortfolio or PortfolioWallet not found");
        const prevTotal = up.totalInvested;
        const nextGeneration = ((_b = (_a = up.subPortfolios[0]) === null || _a === void 0 ? void 0 : _a.generation) !== null && _b !== void 0 ? _b : 0) + 1;
        const newTotalInvested = prevTotal + topupAmount;
        const bankFee = 0;
        const transactionFee = 0;
        const feeAtBank = 0;
        const totalFees = 0;
        const topupNAV = topupAmount;
        const subAssetRows = up.userAssets.map((ua) => {
            var _a, _b;
            const provided = assetPrices[ua.assetId];
            const effectiveCPS = (_a = provided === null || provided === void 0 ? void 0 : provided.costPerShare) !== null && _a !== void 0 ? _a : ua.costPerShare;
            const effectiveCP = (_b = provided === null || provided === void 0 ? void 0 : provided.closePrice) !== null && _b !== void 0 ? _b : ua.asset.closePrice;
            const costPrice = (ua.allocationPercentage / 100) * topupNAV;
            const stock = effectiveCPS > 0 ? costPrice / effectiveCPS : 0;
            const closeValue = effectiveCP * stock;
            const lossGain = closeValue - costPrice;
            return {
                assetId: ua.assetId,
                allocationPercentage: ua.allocationPercentage,
                costPerShare: effectiveCPS,
                costPrice, stock,
                closePrice: effectiveCP,
                closeValue, lossGain,
            };
        });
        const assetPriceUpdates = Object.entries(assetPrices)
            .filter(([, p]) => p.closePrice > 0)
            .map(([assetId, p]) => tx.asset.update({ where: { id: assetId }, data: { closePrice: p.closePrice } }));
        if (assetPriceUpdates.length)
            yield Promise.all(assetPriceUpdates);
        const topupStockByAsset = new Map(subAssetRows.map((r) => [r.assetId, r.stock]));
        const subTotalCostPrice = subAssetRows.reduce((s, r) => s + r.costPrice, 0);
        const subTotalCloseValue = subAssetRows.reduce((s, r) => s + r.closeValue, 0);
        const cashAtBank = topupAmount - subTotalCostPrice;
        const sub = yield tx.subPortfolio.create({
            data: {
                userPortfolioId,
                generation: nextGeneration,
                label: `${up.customName} - Top-up ${nextGeneration}`,
                amountInvested: topupAmount,
                totalCostPrice: subTotalCostPrice,
                totalCloseValue: subTotalCloseValue,
                totalLossGain: subTotalCloseValue - subTotalCostPrice,
                bankFee, transactionFee, feeAtBank, totalFees,
                cashAtBank,
                snapshotDate: new Date(),
            },
        });
        if (subAssetRows.length) {
            yield tx.subPortfolioAsset.createMany({
                data: subAssetRows.map((r) => (Object.assign({ subPortfolioId: sub.id }, r))),
                skipDuplicates: true,
            });
        }
        const newNetAssetValue = newTotalInvested;
        const closePriceByAsset = new Map(subAssetRows.map((r) => [r.assetId, r.closePrice]));
        const assetUpdates = up.userAssets.map((ua) => {
            var _a, _b, _c;
            const topupStock = (_a = topupStockByAsset.get(ua.assetId)) !== null && _a !== void 0 ? _a : 0;
            const newStock = ((_b = ua.stock) !== null && _b !== void 0 ? _b : 0) + topupStock;
            const costPrice = (ua.allocationPercentage / 100) * newNetAssetValue;
            const costPerShare = newStock > 0 ? costPrice / newStock : 0;
            const closePrice = (_c = closePriceByAsset.get(ua.assetId)) !== null && _c !== void 0 ? _c : ua.asset.closePrice;
            const closeValue = closePrice * newStock;
            const lossGain = closeValue - costPrice;
            return { id: ua.id, stock: newStock, costPrice, costPerShare, closeValue, lossGain };
        });
        yield Promise.all(assetUpdates.map((a) => tx.userPortfolioAsset.update({
            where: { id: a.id },
            data: { stock: a.stock, costPrice: a.costPrice, costPerShare: a.costPerShare, closeValue: a.closeValue, lossGain: a.lossGain },
        })));
        const newTotalCloseValue = assetUpdates.reduce((s, a) => s + a.closeValue, 0);
        const newTotalCostPrice = assetUpdates.reduce((s, a) => s + a.costPrice, 0);
        yield tx.userPortfolio.update({
            where: { id: userPortfolioId },
            data: {
                portfolioValue: newTotalCloseValue,
                totalInvested: newTotalInvested,
                totalLossGain: newTotalCloseValue - newTotalInvested,
            },
        });
        yield tx.portfolioWallet.update({
            where: { id: up.wallet.id },
            data: {
                balance: { increment: topupAmount },
                totalFees: 0,
                netAssetValue: newNetAssetValue,
            },
        });
        yield tx.topupEvent.create({
            data: {
                userPortfolioId,
                depositId,
                topupAmount,
                previousTotal: prevTotal,
                newTotalInvested,
                newTotalCloseValue,
                newTotalLossGain: newTotalCloseValue - newTotalInvested,
                newTotalFees: 0,
                newNetAssetValue,
                status: "MERGED",
                mergedAt: new Date(),
                mergedSubPortfolios: { connect: { id: sub.id } },
            },
        });
        return { newTotalCloseValue, newNetAssetValue };
    });
}
function syncMasterWalletNav(tx, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const wallets = yield tx.portfolioWallet.findMany({
            where: { userPortfolio: { userId } },
            select: { netAssetValue: true },
        });
        const totalNav = wallets.reduce((s, w) => { var _a; return s + ((_a = w.netAssetValue) !== null && _a !== void 0 ? _a : 0); }, 0);
        yield tx.masterWallet.updateMany({
            where: { userId },
            data: { netAssetValue: totalNav },
        });
    });
}
function listDeposits(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const q = req.query.q || "";
            const userId = req.query.userId || "";
            const userPortfolioId = req.query.userPortfolioId || "";
            const portfolioWalletId = req.query.portfolioWalletId || "";
            const createdById = req.query.createdById || "";
            const depositTarget = req.query.depositTarget || "";
            const status = asTxStatus(req.query.status);
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
                    createdById ? { createdById } : {},
                    depositTarget ? { depositTarget: depositTarget } : {},
                    status ? { transactionStatus: status } : {},
                    q ? {
                        OR: [
                            { referenceNo: { contains: q, mode: "insensitive" } },
                            { mobileNo: { contains: q, mode: "insensitive" } },
                            { accountNo: { contains: q, mode: "insensitive" } },
                            { description: { contains: q, mode: "insensitive" } },
                            { createdByName: { contains: q, mode: "insensitive" } },
                        ],
                    } : {},
                ],
            };
            const [total, items] = yield db_1.db.$transaction([
                db_1.db.deposit.count({ where }),
                db_1.db.deposit.findMany({
                    where,
                    orderBy: { [sortBy]: order },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    include: DEPOSIT_INCLUDE,
                }),
            ]);
            return res.status(200).json({
                data: items,
                meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
                error: null,
            });
        }
        catch (error) {
            console.error("listDeposits error:", error);
            return res.status(500).json({ data: null, error: "Failed to list deposits" });
        }
    });
}
function getDepositById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const row = yield db_1.db.deposit.findUnique({ where: { id }, include: DEPOSIT_INCLUDE });
            if (!row)
                return res.status(404).json({ data: null, error: "Deposit not found" });
            return res.status(200).json({ data: row, error: null });
        }
        catch (error) {
            console.error("getDepositById error:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch deposit" });
        }
    });
}
function createDeposit(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            const { userId, userPortfolioId, amount, depositTarget, transactionId, mobileNo, referenceNo, accountNo, method, description, createdById, createdByName, createdByRole, proofUrl, proofFileName, bankCost, transactionCost, cashAtBank, } = req.body;
            const target = (depositTarget === "ALLOCATION" ? "ALLOCATION" : "MASTER");
            const amt = num(amount, NaN);
            if (!userId || !Number.isFinite(amt) || amt <= 0) {
                return res.status(400).json({
                    data: null,
                    error: "userId and a positive amount are required",
                });
            }
            if (target === "ALLOCATION" && !userPortfolioId) {
                return res.status(400).json({
                    data: null,
                    error: "userPortfolioId is required for ALLOCATION deposits",
                });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { id: true, masterWallet: { select: { id: true, balance: true } } },
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            let portfolioWalletId = null;
            let masterWalletId = (_b = (_a = user.masterWallet) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
            if (target === "ALLOCATION") {
                const up = yield db_1.db.userPortfolio.findUnique({
                    where: { id: userPortfolioId },
                    select: { id: true, userId: true, wallet: { select: { id: true } } },
                });
                if (!up)
                    return res.status(404).json({ data: null, error: "Portfolio not found" });
                if (up.userId !== userId) {
                    return res.status(403).json({ data: null, error: "Portfolio does not belong to this user" });
                }
                portfolioWalletId = (_d = (_c = up.wallet) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null;
                const balance = (_f = (_e = user.masterWallet) === null || _e === void 0 ? void 0 : _e.balance) !== null && _f !== void 0 ? _f : 0;
                if (balance < amt) {
                    return res.status(400).json({
                        data: null,
                        error: `Insufficient master wallet balance. Available: ${balance.toFixed(2)}`,
                    });
                }
            }
            let isFirstDeposit = false;
            if (target === "MASTER") {
                const priorDeposit = yield db_1.db.deposit.findFirst({
                    where: { userId, depositTarget: "MASTER" },
                    select: { id: true },
                });
                isFirstDeposit = !priorDeposit;
            }
            const masterWallet = yield db_1.db.masterWallet.findUnique({
                where: { userId },
                select: { accountNumber: true },
            });
            const autoRefNo = (masterWallet === null || masterWallet === void 0 ? void 0 : masterWallet.accountNumber)
                ? `${masterWallet.accountNumber}-${Date.now()}`
                : referenceNo !== null && referenceNo !== void 0 ? referenceNo : `DEP-${Date.now()}`;
            const fBankCost = isFirstDeposit ? num(bankCost, 0) : 0;
            const fTransactionCost = isFirstDeposit ? num(transactionCost, 0) : 0;
            const fCashAtBank = isFirstDeposit ? num(cashAtBank, 0) : 0;
            const fTotalFees = fBankCost + fTransactionCost + fCashAtBank;
            const created = yield db_1.db.deposit.create({
                data: {
                    userId,
                    userPortfolioId: userPortfolioId !== null && userPortfolioId !== void 0 ? userPortfolioId : null,
                    portfolioWalletId: portfolioWalletId !== null && portfolioWalletId !== void 0 ? portfolioWalletId : null,
                    masterWalletId: masterWalletId !== null && masterWalletId !== void 0 ? masterWalletId : null,
                    depositTarget: target,
                    amount: amt,
                    transactionStatus: Status.PENDING,
                    transactionId: transactionId !== null && transactionId !== void 0 ? transactionId : null,
                    mobileNo: mobileNo !== null && mobileNo !== void 0 ? mobileNo : null,
                    referenceNo: autoRefNo,
                    accountNo: accountNo !== null && accountNo !== void 0 ? accountNo : null,
                    method: method !== null && method !== void 0 ? method : null,
                    description: description !== null && description !== void 0 ? description : null,
                    proofUrl: proofUrl !== null && proofUrl !== void 0 ? proofUrl : null,
                    proofFileName: proofFileName !== null && proofFileName !== void 0 ? proofFileName : null,
                    createdById: createdById !== null && createdById !== void 0 ? createdById : null,
                    createdByName: createdByName !== null && createdByName !== void 0 ? createdByName : null,
                    createdByRole: (_g = createdByRole) !== null && _g !== void 0 ? _g : null,
                    bankCost: fBankCost,
                    transactionCost: fTransactionCost,
                    cashAtBank: fCashAtBank,
                    totalFees: fTotalFees,
                    isFirstDeposit,
                },
                include: DEPOSIT_INCLUDE,
            });
            return res.status(201).json({ data: created, error: null });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Duplicate transactionId" });
            }
            console.error("createDeposit error:", error);
            return res.status(500).json({ data: null, error: "Failed to create deposit" });
        }
    });
}
function updateDeposit(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const existing = yield db_1.db.deposit.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ data: null, error: "Deposit not found" });
            if (existing.transactionStatus !== Status.PENDING) {
                return res.status(409).json({ data: null, error: "Only PENDING deposits can be updated" });
            }
            const { amount, transactionId, mobileNo, referenceNo, accountNo, method, description, } = req.body;
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
            if (mobileNo !== undefined)
                data.mobileNo = mobileNo;
            if (referenceNo !== undefined)
                data.referenceNo = referenceNo;
            if (accountNo !== undefined)
                data.accountNo = accountNo;
            if (method !== undefined)
                data.method = method;
            if (description !== undefined)
                data.description = description;
            const updated = yield db_1.db.deposit.update({ where: { id }, data, include: DEPOSIT_INCLUDE });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Duplicate transactionId" });
            }
            console.error("updateDeposit error:", error);
            return res.status(500).json({ data: null, error: "Failed to update deposit" });
        }
    });
}
function approveDeposit(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { id } = req.params;
            const { approvedById, approvedByName, transactionId, assetPrices } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
            const existing = yield db_1.db.deposit.findUnique({
                where: { id },
                include: { portfolioWallet: { select: { id: true, netAssetValue: true, totalFees: true } } },
            });
            if (!existing)
                return res.status(404).json({ data: null, error: "Deposit not found" });
            if (existing.transactionStatus === Status.APPROVED) {
                return res.status(200).json({ data: existing, error: null });
            }
            if (existing.transactionStatus === Status.REJECTED) {
                return res.status(409).json({ data: null, error: "Cannot approve a rejected deposit" });
            }
            if (existing.depositTarget === "ALLOCATION") {
                const mw = yield db_1.db.masterWallet.findUnique({
                    where: { userId: existing.userId },
                    select: { balance: true },
                });
                if (!mw || mw.balance < existing.amount) {
                    return res.status(400).json({
                        data: null,
                        error: `Insufficient master wallet balance. Available: ${((_b = mw === null || mw === void 0 ? void 0 : mw.balance) !== null && _b !== void 0 ? _b : 0).toFixed(2)}`,
                    });
                }
                if (!existing.userPortfolioId) {
                    return res.status(400).json({ data: null, error: "ALLOCATION deposit requires a userPortfolioId" });
                }
            }
            const approved = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                const row = yield tx.deposit.update({
                    where: { id },
                    data: {
                        transactionStatus: Status.APPROVED,
                        transactionId: (_a = transactionId !== null && transactionId !== void 0 ? transactionId : existing.transactionId) !== null && _a !== void 0 ? _a : null,
                        approvedById: approvedById !== null && approvedById !== void 0 ? approvedById : null,
                        approvedByName: approvedByName !== null && approvedByName !== void 0 ? approvedByName : null,
                        approvedAt: new Date(),
                    },
                });
                if (existing.depositTarget === "MASTER") {
                    const netAmount = existing.amount - ((_b = existing.totalFees) !== null && _b !== void 0 ? _b : 0);
                    yield tx.masterWallet.updateMany({
                        where: { userId: existing.userId },
                        data: Object.assign({ balance: { increment: netAmount > 0 ? netAmount : existing.amount }, totalDeposited: { increment: existing.amount } }, (existing.isFirstDeposit && existing.totalFees > 0
                            ? { totalFees: existing.totalFees }
                            : {})),
                    });
                }
                else {
                    yield tx.masterWallet.updateMany({
                        where: { userId: existing.userId },
                        data: { balance: { decrement: existing.amount } },
                    });
                    yield applyTopup(tx, id, existing.userPortfolioId, existing.amount, assetPrices !== null && assetPrices !== void 0 ? assetPrices : {});
                    yield syncMasterWalletNav(tx, existing.userId);
                }
                return row;
            }), { timeout: 30000 });
            const result = yield db_1.db.deposit.findUnique({ where: { id: approved.id }, include: DEPOSIT_INCLUDE });
            return res.status(200).json({ data: result, error: null });
        }
        catch (error) {
            console.error("approveDeposit error:", error);
            return res.status(500).json({ data: null, error: "Failed to approve deposit" });
        }
    });
}
function rejectDeposit(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { id } = req.params;
            const { rejectedById, rejectedByName, reason } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
            const existing = yield db_1.db.deposit.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ data: null, error: "Deposit not found" });
            if (existing.transactionStatus === Status.REJECTED) {
                return res.status(200).json({ data: existing, error: null });
            }
            if (existing.transactionStatus === Status.APPROVED) {
                return res.status(409).json({
                    data: null,
                    error: "Cannot reject an approved deposit. Use the reverse endpoint instead.",
                });
            }
            const rejected = yield db_1.db.deposit.update({
                where: { id },
                data: {
                    transactionStatus: Status.REJECTED,
                    rejectedById: rejectedById !== null && rejectedById !== void 0 ? rejectedById : null,
                    rejectedByName: rejectedByName !== null && rejectedByName !== void 0 ? rejectedByName : null,
                    rejectedAt: new Date(),
                    rejectReason: reason !== null && reason !== void 0 ? reason : null,
                },
                include: DEPOSIT_INCLUDE,
            });
            return res.status(200).json({ data: rejected, error: null });
        }
        catch (error) {
            console.error("rejectDeposit error:", error);
            return res.status(500).json({ data: null, error: "Failed to reject deposit" });
        }
    });
}
function reverseDeposit(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const { id } = req.params;
            const { rejectedById, rejectedByName, reason } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
            const existing = yield db_1.db.deposit.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ data: null, error: "Deposit not found" });
            if (existing.transactionStatus === Status.REJECTED) {
                return res.status(200).json({ data: existing, error: null });
            }
            if (existing.transactionStatus === Status.PENDING) {
                return res.status(409).json({ data: null, error: "Deposit is still PENDING. Use reject instead." });
            }
            const reversed = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const row = yield tx.deposit.update({
                    where: { id },
                    data: {
                        transactionStatus: Status.REJECTED,
                        rejectedById: rejectedById !== null && rejectedById !== void 0 ? rejectedById : null,
                        rejectedByName: rejectedByName !== null && rejectedByName !== void 0 ? rejectedByName : null,
                        rejectedAt: new Date(),
                        rejectReason: reason !== null && reason !== void 0 ? reason : "Reversed",
                    },
                });
                if (existing.depositTarget === "MASTER") {
                    yield tx.masterWallet.updateMany({
                        where: { userId: existing.userId },
                        data: {
                            balance: { decrement: existing.amount },
                            totalDeposited: { decrement: existing.amount },
                        },
                    });
                }
                else {
                    yield tx.masterWallet.updateMany({
                        where: { userId: existing.userId },
                        data: { balance: { increment: existing.amount } },
                    });
                    if (existing.portfolioWalletId) {
                        yield tx.portfolioWallet.update({
                            where: { id: existing.portfolioWalletId },
                            data: {
                                balance: { decrement: existing.amount },
                                netAssetValue: { decrement: existing.amount },
                            },
                        });
                    }
                    yield syncMasterWalletNav(tx, existing.userId);
                }
                return row;
            }));
            const result = yield db_1.db.deposit.findUnique({ where: { id: reversed.id }, include: DEPOSIT_INCLUDE });
            return res.status(200).json({ data: result, error: null });
        }
        catch (error) {
            console.error("reverseDeposit error:", error);
            return res.status(500).json({ data: null, error: "Failed to reverse deposit" });
        }
    });
}
function deleteDeposit(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const existing = yield db_1.db.deposit.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ data: null, error: "Deposit not found" });
            if (existing.transactionStatus === Status.APPROVED) {
                return res.status(409).json({
                    data: null,
                    error: "Cannot delete an approved deposit. Reverse it first.",
                });
            }
            yield db_1.db.deposit.delete({ where: { id } });
            return res.status(200).json({ data: null, error: null, message: "Deposit deleted" });
        }
        catch (error) {
            console.error("deleteDeposit error:", error);
            return res.status(500).json({ data: null, error: "Failed to delete deposit" });
        }
    });
}
function getDepositFeeSummary(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userId } = req.params;
            const deposits = yield db_1.db.deposit.findMany({
                where: {
                    userId,
                    transactionStatus: Status.APPROVED,
                },
                select: {
                    bankCost: true,
                    transactionCost: true,
                    cashAtBank: true,
                    totalFees: true,
                },
            });
            const summary = deposits.reduce((acc, deposit) => {
                var _a, _b, _c, _d;
                return ({
                    totalBankCost: acc.totalBankCost + ((_a = deposit.bankCost) !== null && _a !== void 0 ? _a : 0),
                    totalTransactionCost: acc.totalTransactionCost + ((_b = deposit.transactionCost) !== null && _b !== void 0 ? _b : 0),
                    totalCashAtBank: acc.totalCashAtBank + ((_c = deposit.cashAtBank) !== null && _c !== void 0 ? _c : 0),
                    totalFees: acc.totalFees + ((_d = deposit.totalFees) !== null && _d !== void 0 ? _d : 0),
                    depositCount: acc.depositCount + 1,
                });
            }, {
                totalBankCost: 0,
                totalTransactionCost: 0,
                totalCashAtBank: 0,
                totalFees: 0,
                depositCount: 0,
            });
            return res.status(200).json({ data: summary, error: null });
        }
        catch (error) {
            console.error("getDepositFeeSummary error:", error);
            return res.status(500).json({ data: null, error: "Failed to get deposit fee summary" });
        }
    });
}
