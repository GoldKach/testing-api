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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleDailyZeroBalanceCheck = scheduleDailyZeroBalanceCheck;
exports.schedule6HourZeroBalanceCheck = schedule6HourZeroBalanceCheck;
exports.scheduleHourlyZeroBalanceCheck = scheduleHourlyZeroBalanceCheck;
exports.startZeroBalanceDeactivationCronFromEnv = startZeroBalanceDeactivationCronFromEnv;
exports.executeZeroBalanceJob = executeZeroBalanceJob;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../db/db");
const mailer_1 = require("../lib/mailer");
const client_1 = require("@prisma/client");
const ZERO_BALANCE_DAYS_THRESHOLD = 7;
function executeZeroBalanceJob(label) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        console.log("============================================================");
        console.log(`🕐 ${label} ZERO BALANCE DEACTIVATION CHECK`);
        console.log(`   Time: ${new Date().toISOString()}`);
        console.log(`   Threshold: ${ZERO_BALANCE_DAYS_THRESHOLD} days`);
        console.log("============================================================");
        const result = {
            warningsSent: 0,
            deactivated: 0,
            skipped: 0,
            errors: [],
        };
        try {
            const activeUsers = yield db_1.db.user.findMany({
                where: {
                    status: client_1.UserStatus.ACTIVE,
                    isApproved: true,
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    name: true,
                    zeroBalanceStartedAt: true,
                    zeroBalanceWarningSentAt: true,
                    masterWallet: {
                        select: {
                            id: true,
                            balance: true,
                        },
                    },
                    userPortfolios: {
                        select: {
                            wallet: {
                                select: {
                                    balance: true,
                                },
                            },
                        },
                    },
                },
            });
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - ZERO_BALANCE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000);
            for (const user of activeUsers) {
                try {
                    const masterBalance = (_b = (_a = user.masterWallet) === null || _a === void 0 ? void 0 : _a.balance) !== null && _b !== void 0 ? _b : 0;
                    const portfolioBalances = user.userPortfolios.map((up) => { var _a, _b; return (_b = (_a = up.wallet) === null || _a === void 0 ? void 0 : _a.balance) !== null && _b !== void 0 ? _b : 0; });
                    const hasZeroBalance = masterBalance === 0 && portfolioBalances.every((b) => b === 0);
                    if (!hasZeroBalance) {
                        if (user.zeroBalanceStartedAt) {
                            yield db_1.db.user.update({
                                where: { id: user.id },
                                data: {
                                    zeroBalanceStartedAt: null,
                                    zeroBalanceWarningSentAt: null,
                                },
                            });
                            console.log(`   ✅ Reset zero-balance tracking for: ${user.email}`);
                        }
                        result.skipped++;
                        continue;
                    }
                    const startDate = user.zeroBalanceStartedAt;
                    if (!startDate) {
                        yield db_1.db.user.update({
                            where: { id: user.id },
                            data: { zeroBalanceStartedAt: now },
                        });
                        console.log(`   📊 Started zero-balance tracking for: ${user.email}`);
                        result.skipped++;
                        continue;
                    }
                    const daysSinceZeroBalance = Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
                    if (daysSinceZeroBalance >= ZERO_BALANCE_DAYS_THRESHOLD) {
                        yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                            yield tx.user.update({
                                where: { id: user.id },
                                data: {
                                    status: client_1.UserStatus.DEACTIVATED,
                                    zeroBalanceStartedAt: null,
                                    zeroBalanceWarningSentAt: null,
                                },
                            });
                            if (user.masterWallet) {
                                yield tx.masterWallet.update({
                                    where: { id: user.masterWallet.id },
                                    data: { status: "INACTIVE" },
                                });
                            }
                            const portfolioWallets = yield tx.portfolioWallet.findMany({
                                where: {
                                    userPortfolio: {
                                        userId: user.id,
                                    },
                                },
                            });
                            for (const wallet of portfolioWallets) {
                                yield tx.portfolioWallet.update({
                                    where: { id: wallet.id },
                                    data: { status: "INACTIVE" },
                                });
                            }
                        }));
                        try {
                            yield (0, mailer_1.sendAccountDeactivatedEmail)({
                                to: user.email,
                                name: (_d = (_c = user.firstName) !== null && _c !== void 0 ? _c : user.name) !== null && _d !== void 0 ? _d : "there",
                                daysInactive: ZERO_BALANCE_DAYS_THRESHOLD,
                            });
                        }
                        catch (emailError) {
                            console.warn(`   ⚠️  Failed to send deactivation email to ${user.email}:`, emailError);
                        }
                        result.deactivated++;
                        console.log(`   ✅ Deactivated: ${user.email} (after ${daysSinceZeroBalance} days)`);
                    }
                    else if (!user.zeroBalanceWarningSentAt || new Date(user.zeroBalanceWarningSentAt) < sevenDaysAgo) {
                        const daysRemaining = ZERO_BALANCE_DAYS_THRESHOLD - daysSinceZeroBalance;
                        try {
                            yield (0, mailer_1.sendAccountZeroBalanceWarningEmail)({
                                to: user.email,
                                name: (_f = (_e = user.firstName) !== null && _e !== void 0 ? _e : user.name) !== null && _f !== void 0 ? _f : "there",
                                daysRemaining,
                            });
                        }
                        catch (emailError) {
                            console.warn(`   ⚠️  Failed to send warning email to ${user.email}:`, emailError);
                        }
                        yield db_1.db.user.update({
                            where: { id: user.id },
                            data: { zeroBalanceWarningSentAt: now },
                        });
                        result.warningsSent++;
                        console.log(`   📧 Sent warning to: ${user.email} (${daysRemaining} days remaining)`);
                    }
                    else {
                        result.skipped++;
                        console.log(`   ⏭️  Skipped: ${user.email} (warning already sent)`);
                    }
                }
                catch (err) {
                    const errorMsg = `Error processing ${user.email}: ${String(err)}`;
                    result.errors.push(errorMsg);
                    console.error(`   ❌ ${errorMsg}`);
                }
            }
            console.log("");
            console.log("📊 Zero Balance Job Summary:");
            console.log(`   📧 Warnings sent   : ${result.warningsSent}`);
            console.log(`   ✅ Deactivated     : ${result.deactivated}`);
            console.log(`   ⏭️  Skipped         : ${result.skipped}`);
            if (result.errors.length) {
                console.log("   ⚠️  Errors:");
                for (const err of result.errors) {
                    console.log(`      - ${err}`);
                }
            }
            console.log("============================================================");
            return result;
        }
        catch (err) {
            console.error("❌ Zero balance job FAILED:", err);
            console.log("============================================================");
            result.errors.push(String(err));
            return result;
        }
    });
}
function scheduleDailyZeroBalanceCheck() {
    console.log("============================================================");
    console.log("📅 DAILY ZERO BALANCE CHECK SCHEDULER INITIALIZED");
    console.log(`⏰ Runs every day at 3:00 AM (server time)`);
    console.log(`   Threshold: ${ZERO_BALANCE_DAYS_THRESHOLD} days before deactivation`);
    console.log("============================================================");
    node_cron_1.default.schedule("0 3 * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executeZeroBalanceJob("DAILY");
    }));
}
function schedule6HourZeroBalanceCheck() {
    console.log("============================================================");
    console.log("📅 6-HOUR ZERO BALANCE CHECK SCHEDULER INITIALIZED");
    console.log(`⏰ Runs every 6 hours`);
    console.log(`   Threshold: ${ZERO_BALANCE_DAYS_THRESHOLD} days before deactivation`);
    console.log("============================================================");
    node_cron_1.default.schedule("0 */6 * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executeZeroBalanceJob("6-HOUR");
    }));
}
function scheduleHourlyZeroBalanceCheck() {
    console.log("============================================================");
    console.log("📅 HOURLY ZERO BALANCE CHECK SCHEDULER INITIALIZED");
    console.log(`⏰ Runs every hour — TESTING ONLY`);
    console.log(`   Threshold: ${ZERO_BALANCE_DAYS_THRESHOLD} days before deactivation`);
    console.log("⚠️  Switch to scheduleDailyZeroBalanceCheck() for production");
    console.log("============================================================");
    node_cron_1.default.schedule("0 * * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executeZeroBalanceJob("HOURLY");
    }));
}
function startZeroBalanceDeactivationCronFromEnv() {
    if (process.env.NODE_ENV === "test") {
        console.log("🧪 Zero balance deactivation cron disabled in test environment.");
        return;
    }
    const mode = (process.env.ZERO_BALANCE_CRON_MODE || "daily").toLowerCase();
    switch (mode) {
        case "daily":
            scheduleDailyZeroBalanceCheck();
            break;
        case "6-hour":
        case "6hour":
        case "6hours":
            schedule6HourZeroBalanceCheck();
            break;
        case "hourly":
            scheduleHourlyZeroBalanceCheck();
            break;
        default:
            scheduleDailyZeroBalanceCheck();
            break;
    }
    console.log(`🔁 Zero balance check cron mode active: ${mode}`);
}
