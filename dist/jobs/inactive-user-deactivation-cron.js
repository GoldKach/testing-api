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
exports.scheduleDailyInactiveUserDeactivation = scheduleDailyInactiveUserDeactivation;
exports.schedule6HourInactiveUserDeactivation = schedule6HourInactiveUserDeactivation;
exports.scheduleHourlyInactiveUserDeactivation = scheduleHourlyInactiveUserDeactivation;
exports.startInactiveUserDeactivationCronFromEnv = startInactiveUserDeactivationCronFromEnv;
exports.executeInactiveUserDeactivation = executeInactiveUserDeactivation;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../db/db");
const mailer_1 = require("../lib/mailer");
const client_1 = require("@prisma/client");
const INACTIVITY_DAYS = 7;
const INACTIVITY_MS = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
function executeInactiveUserDeactivation(label) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - INACTIVITY_MS);
        console.log("============================================================");
        console.log(`🕐 ${label} INACTIVE USER DEACTIVATION`);
        console.log(`   Time: ${now.toISOString()}`);
        console.log(`   Inactivity threshold: ${INACTIVITY_DAYS} days`);
        console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
        console.log("============================================================");
        const result = {
            total: 0,
            deactivated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
        };
        try {
            const inactiveUsers = yield db_1.db.user.findMany({
                where: {
                    status: client_1.UserStatus.ACTIVE,
                    masterWallet: {
                        balance: 0,
                        updatedAt: {
                            lt: cutoffDate,
                        },
                    },
                    isApproved: true,
                },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    name: true,
                    masterWallet: {
                        select: {
                            id: true,
                            updatedAt: true,
                            balance: true,
                        },
                    },
                },
            });
            result.total = inactiveUsers.length;
            if (inactiveUsers.length === 0) {
                console.log("📭 No inactive users found.");
                console.log("============================================================");
                return result;
            }
            console.log(`📋 Found ${inactiveUsers.length} inactive users to process.`);
            for (const user of inactiveUsers) {
                try {
                    yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                        yield tx.user.update({
                            where: { id: user.id },
                            data: { status: client_1.UserStatus.DEACTIVATED },
                        });
                        if (user.masterWallet) {
                            yield tx.masterWallet.update({
                                where: { id: user.masterWallet.id },
                                data: { status: "INACTIVE" },
                            });
                        }
                    }));
                    try {
                        yield (0, mailer_1.sendAccountDeactivatedEmail)({
                            to: user.email,
                            name: (_b = (_a = user.firstName) !== null && _a !== void 0 ? _a : user.name) !== null && _b !== void 0 ? _b : "there",
                            daysInactive: INACTIVITY_DAYS,
                        });
                    }
                    catch (emailError) {
                        console.warn(`   ⚠️  Failed to send deactivation email to ${user.email}:`, emailError);
                    }
                    result.deactivated++;
                    console.log(`   ✅ Deactivated: ${user.email} (${(_c = user.firstName) !== null && _c !== void 0 ? _c : user.name})`);
                }
                catch (err) {
                    result.failed++;
                    const errorMsg = `Failed to deactivate ${user.email}: ${String(err)}`;
                    result.errors.push(errorMsg);
                    console.error(`   ❌ ${errorMsg}`);
                }
            }
            console.log("");
            console.log("📊 Deactivation Summary:");
            console.log(`   Total inactive users : ${result.total}`);
            console.log(`   ✅ Deactivated       : ${result.deactivated}`);
            console.log(`   ⏭️  Skipped          : ${result.skipped}`);
            console.log(`   ❌ Failed            : ${result.failed}`);
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
            console.error("❌ Inactive user deactivation job FAILED:", err);
            console.log("============================================================");
            result.errors.push(String(err));
            return result;
        }
    });
}
function scheduleDailyInactiveUserDeactivation() {
    console.log("============================================================");
    console.log("📅 DAILY INACTIVE USER DEACTIVATION SCHEDULER INITIALIZED");
    console.log(`⏰ Runs every day at 2:00 AM (server time)`);
    console.log(`⏰ Inactivity threshold: ${INACTIVITY_DAYS} days`);
    console.log("============================================================");
    node_cron_1.default.schedule("0 2 * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executeInactiveUserDeactivation("DAILY");
    }));
}
function schedule6HourInactiveUserDeactivation() {
    console.log("============================================================");
    console.log("📅 6-HOUR INACTIVE USER DEACTIVATION SCHEDULER INITIALIZED");
    console.log(`⏰ Runs every 6 hours`);
    console.log(`⏰ Inactivity threshold: ${INACTIVITY_DAYS} days`);
    console.log("============================================================");
    node_cron_1.default.schedule("0 */6 * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executeInactiveUserDeactivation("6-HOUR");
    }));
}
function scheduleHourlyInactiveUserDeactivation() {
    console.log("============================================================");
    console.log("📅 HOURLY INACTIVE USER DEACTIVATION SCHEDULER INITIALIZED");
    console.log(`⏰ Runs every hour — TESTING ONLY`);
    console.log(`⏰ Inactivity threshold: ${INACTIVITY_DAYS} days`);
    console.log("⚠️  Switch to scheduleDailyInactiveUserDeactivation() for production");
    console.log("============================================================");
    node_cron_1.default.schedule("0 * * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executeInactiveUserDeactivation("HOURLY");
    }));
}
function startInactiveUserDeactivationCronFromEnv() {
    if (process.env.NODE_ENV === "test") {
        console.log("🧪 Inactive user deactivation cron disabled in test environment.");
        return;
    }
    const mode = (process.env.INACTIVE_USER_CRON_MODE || "daily").toLowerCase();
    switch (mode) {
        case "daily":
            scheduleDailyInactiveUserDeactivation();
            break;
        case "6-hour":
        case "6hour":
        case "6hours":
            schedule6HourInactiveUserDeactivation();
            break;
        case "hourly":
            scheduleHourlyInactiveUserDeactivation();
            break;
        default:
            scheduleDailyInactiveUserDeactivation();
            break;
    }
    console.log(`🔁 Inactive user deactivation cron mode active: ${mode}`);
}
