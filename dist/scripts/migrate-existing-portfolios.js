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
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const db = new client_1.PrismaClient();
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
                ? yield db.portfolioWallet.findUnique({ where: { accountNumber } })
                : yield db.masterWallet.findFirst({ where: { accountNumber } });
            if (!conflict)
                return accountNumber;
        }
        throw new Error(`Could not generate unique account number for prefix ${prefix}`);
    });
}
function migrateExistingPortfolios() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log("🚀 Starting portfolio migration...\n");
        const defaultBankFee = 30;
        const defaultTransactionFee = 10;
        const defaultFeeAtBank = 10;
        const defaultTotalFees = defaultBankFee + defaultTransactionFee + defaultFeeAtBank;
        const userPortfolios = yield db.userPortfolio.findMany({
            include: {
                portfolio: true,
                userAssets: { include: { asset: true } },
                user: { include: { masterWallet: true } },
            },
            orderBy: { createdAt: "asc" },
        });
        console.log(`Found ${userPortfolios.length} UserPortfolio(s) to migrate.\n`);
        let migrated = 0;
        let upToDate = 0;
        let failed = 0;
        const errors = [];
        for (const up of userPortfolios) {
            try {
                console.log(`\n── Processing: [${up.id}] user=${up.user.email} portfolio=${up.portfolio.name}`);
                const totalCostPrice = up.userAssets.reduce((s, ua) => s + toNum(ua.costPrice), 0);
                const totalCloseValue = up.userAssets.reduce((s, ua) => s + toNum(ua.closeValue), 0);
                const totalLossGain = up.userAssets.reduce((s, ua) => s + toNum(ua.lossGain), 0);
                const netAssetValue = totalCloseValue - defaultTotalFees;
                const actions = [];
                yield db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    const patch = {};
                    if (!up.customName || up.customName.trim() === "") {
                        patch.customName = up.portfolio.name;
                        actions.push(`Set customName`);
                        console.log(`   ✏️  Setting customName = "${up.portfolio.name}"`);
                    }
                    if (toNum(up.totalInvested) === 0 && totalCostPrice > 0) {
                        patch.totalInvested = totalCostPrice;
                        patch.totalLossGain = totalLossGain;
                        patch.portfolioValue = totalCloseValue;
                        actions.push("Backfilled totals");
                        console.log(`   💰 Backfilling totalInvested=${totalCostPrice.toFixed(2)}`);
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
                        actions.push("Created PortfolioWallet");
                        console.log(`   🏦 Created PortfolioWallet [${wallet.id}] NAV=${netAssetValue.toFixed(2)}`);
                    }
                    else {
                        walletId = existingWallet.id;
                        console.log(`   🏦 PortfolioWallet already exists [${existingWallet.id}] — skipping`);
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
                        actions.push("Created SubPortfolio gen=0");
                        console.log(`   📦 Created SubPortfolio gen=0 [${sub.id}]`);
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
                            console.log(`   📊 Created ${up.userAssets.length} SubPortfolioAsset snapshot(s)`);
                        }
                    }
                    else {
                        console.log(`   📦 SubPortfolio gen=0 already exists [${existingSub.id}] — skipping`);
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
                        actions.push("Created MasterWallet");
                        console.log(`   💼 Created MasterWallet [${mw.id}]`);
                    }
                    else {
                        console.log(`   💼 MasterWallet already exists [${up.user.masterWallet.id}] — skipping`);
                    }
                }));
                if (actions.length > 0)
                    migrated++;
                else
                    upToDate++;
                console.log(`   ✅ Done`);
            }
            catch (err) {
                failed++;
                const msg = `[${up.id}] ${up.user.email} — ${err.message}`;
                errors.push(msg);
                console.error(`   ❌ FAILED: ${msg}`);
            }
        }
        console.log("\n🔄 Syncing all MasterWallet NAVs...");
        const allUsers = yield db.user.findMany({
            where: { masterWallet: { isNot: null } },
            select: { id: true, email: true },
        });
        for (const user of allUsers) {
            try {
                const wallets = yield db.portfolioWallet.findMany({
                    where: { userPortfolio: { userId: user.id } },
                    select: { netAssetValue: true, totalFees: true },
                });
                const totalNAV = wallets.reduce((s, w) => s + toNum(w.netAssetValue), 0);
                const totalFees = wallets.reduce((s, w) => s + toNum(w.totalFees), 0);
                const [deposited, withdrawn] = yield Promise.all([
                    db.deposit.aggregate({
                        where: { userId: user.id, transactionStatus: "APPROVED" },
                        _sum: { amount: true },
                    }),
                    db.withdrawal.aggregate({
                        where: { userId: user.id, transactionStatus: "APPROVED" },
                        _sum: { amount: true },
                    }),
                ]);
                yield db.masterWallet.update({
                    where: { userId: user.id },
                    data: {
                        netAssetValue: totalNAV,
                        totalFees,
                        totalDeposited: (_a = deposited._sum.amount) !== null && _a !== void 0 ? _a : 0,
                        totalWithdrawn: (_b = withdrawn._sum.amount) !== null && _b !== void 0 ? _b : 0,
                    },
                });
                console.log(`   ✅ Synced ${user.email} → NAV=${totalNAV.toFixed(2)}`);
            }
            catch (err) {
                console.error(`   ❌ Failed to sync ${user.email}: ${err.message}`);
            }
        }
        console.log("\n" + "═".repeat(50));
        console.log("📋 Migration Summary");
        console.log("═".repeat(50));
        console.log(`   Total       : ${userPortfolios.length}`);
        console.log(`   ✅ Migrated  : ${migrated}`);
        console.log(`   ⏭️  Up to date: ${upToDate}`);
        console.log(`   ❌ Failed    : ${failed}`);
        if (errors.length) {
            console.log("\n   Errors:");
            errors.forEach((e) => console.log(`     • ${e}`));
        }
        console.log("═".repeat(50));
        yield db.$disconnect();
    });
}
migrateExistingPortfolios().catch((err) => {
    console.error("Fatal migration error:", err);
    process.exit(1);
});
