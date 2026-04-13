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
exports.schedule30MinutePortfolioReports = schedule30MinutePortfolioReports;
exports.schedule1MinutePortfolioReports = schedule1MinutePortfolioReports;
exports.schedule2MinutePortfolioReports = schedule2MinutePortfolioReports;
exports.schedule5MinutePortfolioReports = schedule5MinutePortfolioReports;
exports.schedule10MinutePortfolioReports = schedule10MinutePortfolioReports;
exports.schedule30SecondPortfolioReports = schedule30SecondPortfolioReports;
exports.scheduleDailyPortfolioReports = scheduleDailyPortfolioReports;
exports.startPortfolioReportCronFromEnv = startPortfolioReportCronFromEnv;
const node_cron_1 = __importDefault(require("node-cron"));
const portfolio_performance_reports_1 = require("../controllers/portfolio-performance-reports");
function executePortfolioReportJob(label) {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date().toISOString();
        console.log("============================================================");
        console.log(`🕐 ${label} PORTFOLIO REPORT GENERATION`);
        console.log(`   Time: ${now}`);
        console.log("============================================================");
        try {
            console.log("🚀 Starting daily report generation for all portfolios...");
            const result = yield (0, portfolio_performance_reports_1.generateDailyReportsForAllPortfolios)();
            console.log("");
            console.log("📊 Report Generation Summary:");
            console.log(`   Total portfolios: ${result.total}`);
            console.log(`   ✅ Successfully generated (incl. skipped-existing): ${result.success}`);
            console.log(`   ❌ Failed: ${result.failed}`);
            if (result.errors.length) {
                console.log("   ⚠️  Errors:");
                for (const err of result.errors) {
                    console.log(`      - ${err}`);
                }
            }
            console.log("============================================================");
        }
        catch (err) {
            console.error("❌ Portfolio report job FAILED:", err);
            console.log("============================================================");
        }
    });
}
function schedule30MinutePortfolioReports() {
    console.log("============================================================");
    console.log("📅 30-MINUTE PORTFOLIO REPORT SCHEDULER INITIALIZED");
    console.log("⏰ Reports will be generated EVERY 30 MINUTES");
    console.log("⚠️  WARNING: This is for TESTING ONLY!");
    console.log("⚠️  For production, switch to the daily scheduler (1:00 AM).");
    console.log("============================================================");
    node_cron_1.default.schedule("*/30 * * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executePortfolioReportJob("30-MINUTE");
    }));
}
function schedule1MinutePortfolioReports() {
    node_cron_1.default.schedule("* * * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executePortfolioReportJob("1-MINUTE");
    }));
}
function schedule2MinutePortfolioReports() {
    node_cron_1.default.schedule("*/2 * * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executePortfolioReportJob("2-MINUTE");
    }));
}
function schedule5MinutePortfolioReports() {
    node_cron_1.default.schedule("*/5 * * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executePortfolioReportJob("5-MINUTE");
    }));
}
function schedule10MinutePortfolioReports() {
    node_cron_1.default.schedule("*/10 * * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executePortfolioReportJob("10-MINUTE");
    }));
}
function schedule30SecondPortfolioReports() {
    setInterval(() => {
        void executePortfolioReportJob("30-SECOND");
    }, 30 * 1000);
}
function scheduleDailyPortfolioReports() {
    console.log("============================================================");
    console.log("📅 DAILY PORTFOLIO REPORT SCHEDULER INITIALIZED");
    console.log("⏰ Reports will be generated EVERY DAY at 1:00 AM");
    console.log("============================================================");
    node_cron_1.default.schedule("0 1 * * *", () => __awaiter(this, void 0, void 0, function* () {
        yield executePortfolioReportJob("DAILY");
    }));
}
function startPortfolioReportCronFromEnv() {
    if (process.env.NODE_ENV === "test") {
        console.log("🧪 Cron disabled in test environment.");
        return;
    }
    const mode = (process.env.CRON_MODE || "30-minute").toLowerCase();
    switch (mode) {
        case "daily":
            scheduleDailyPortfolioReports();
            break;
        case "1-minute":
        case "1min":
            schedule1MinutePortfolioReports();
            break;
        case "2-minute":
        case "2min":
            schedule2MinutePortfolioReports();
            break;
        case "5-minute":
        case "5min":
            schedule5MinutePortfolioReports();
            break;
        case "10-minute":
        case "10min":
            schedule10MinutePortfolioReports();
            break;
        case "30-second":
        case "30sec":
            schedule30SecondPortfolioReports();
            break;
        case "30-minute":
        case "30min":
        default:
            schedule30MinutePortfolioReports();
            break;
    }
    console.log(`🔁 Cron mode active: ${mode}`);
}
