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
exports.generateDailyReportsForAllPortfolios = generateDailyReportsForAllPortfolios;
exports.generatePerformanceReport = generatePerformanceReport;
exports.generateUserPerformanceReports = generateUserPerformanceReports;
exports.generateAllPerformanceReports = generateAllPerformanceReports;
exports.getLatestPerformanceReport = getLatestPerformanceReport;
exports.listPerformanceReports = listPerformanceReports;
exports.getPerformanceReportById = getPerformanceReportById;
exports.getPerformanceStatistics = getPerformanceStatistics;
exports.cleanupPerformanceReports = cleanupPerformanceReports;
exports.generateDailyReportsForUser = generateDailyReportsForUser;
const db_1 = require("../db/db");
function determineAssetClass(asset) {
    var _a, _b, _c;
    if (asset.assetClass)
        return asset.assetClass;
    const symbol = ((_a = asset.symbol) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const description = ((_b = asset.description) !== null && _b !== void 0 ? _b : "").toLowerCase();
    const sector = ((_c = asset.sector) !== null && _c !== void 0 ? _c : "").toLowerCase();
    if (description.includes("etf") ||
        description.includes("exchange traded fund") ||
        ["qqq", "spy", "voo", "iwm", "soxx", "xlk", "vti"].includes(symbol))
        return "ETFS";
    if (sector.includes("real estate") || sector.includes("reit") || description.includes("reit"))
        return "REITS";
    if (sector.includes("bond") || symbol.includes("bond") || description.includes("bond") || description.includes("treasury"))
        return "BONDS";
    if (symbol === "cash" || description === "cash" || symbol === "usd")
        return "CASH";
    return "EQUITIES";
}
function generatePortfolioReport(userPortfolioId_1) {
    return __awaiter(this, arguments, void 0, function* (userPortfolioId, reportDate = new Date()) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            const userPortfolio = yield db_1.db.userPortfolio.findUnique({
                where: { id: userPortfolioId },
                include: {
                    wallet: true,
                    userAssets: {
                        include: { asset: true },
                    },
                    subPortfolios: {
                        orderBy: { generation: "asc" },
                    },
                },
            });
            if (!userPortfolio) {
                console.error(`UserPortfolio ${userPortfolioId} not found`);
                return null;
            }
            const totalFees = (_b = (_a = userPortfolio.wallet) === null || _a === void 0 ? void 0 : _a.totalFees) !== null && _b !== void 0 ? _b : 0;
            const walletBalance = (_d = (_c = userPortfolio.wallet) === null || _c === void 0 ? void 0 : _c.balance) !== null && _d !== void 0 ? _d : 0;
            if (userPortfolio.userAssets.length === 0) {
                return {
                    userPortfolioId,
                    reportDate,
                    totalCostPrice: 0,
                    totalCloseValue: 0,
                    totalLossGain: 0,
                    totalPercentage: 0,
                    totalFees,
                    netAssetValue: walletBalance - totalFees,
                    assetBreakdown: [],
                    subPortfolioSnapshots: [],
                };
            }
            let totalCostPrice = 0;
            let totalCloseValue = 0;
            let totalLossGain = 0;
            const ALL_CLASSES = ["EQUITIES", "ETFS", "REITS", "BONDS", "CASH", "OTHERS"];
            const classMap = new Map();
            ALL_CLASSES.forEach((c) => classMap.set(c, { holdings: 0, totalCashValue: 0 }));
            for (const ua of userPortfolio.userAssets) {
                totalCostPrice += (_e = ua.costPrice) !== null && _e !== void 0 ? _e : 0;
                totalCloseValue += (_f = ua.closeValue) !== null && _f !== void 0 ? _f : 0;
                totalLossGain += (_g = ua.lossGain) !== null && _g !== void 0 ? _g : 0;
                const cls = determineAssetClass(ua.asset);
                const entry = classMap.get(cls);
                entry.holdings += 1;
                entry.totalCashValue += (_h = ua.closeValue) !== null && _h !== void 0 ? _h : 0;
            }
            const assetBreakdown = Array.from(classMap.entries()).map(([assetClass, data]) => ({
                assetClass,
                holdings: data.holdings,
                totalCashValue: data.totalCashValue,
                percentage: totalCloseValue > 0 ? (data.totalCashValue / totalCloseValue) * 100 : 0,
            }));
            const totalPercentage = totalCostPrice > 0 ? (totalLossGain / totalCostPrice) * 100 : 0;
            const netAssetValue = totalCloseValue - totalFees;
            const subPortfolioSnapshots = userPortfolio.subPortfolios.map((sub) => ({
                subPortfolioId: sub.id,
                generation: sub.generation,
                label: sub.label,
                amountInvested: sub.amountInvested,
                totalCostPrice: sub.totalCostPrice,
                totalCloseValue: sub.totalCloseValue,
                totalLossGain: sub.totalLossGain,
                totalFees: sub.totalFees,
                cashAtBank: sub.cashAtBank,
            }));
            return {
                userPortfolioId,
                reportDate,
                totalCostPrice,
                totalCloseValue,
                totalLossGain,
                totalPercentage,
                totalFees,
                netAssetValue,
                assetBreakdown,
                subPortfolioSnapshots,
            };
        }
        catch (error) {
            console.error("Error generating portfolio report:", error);
            return null;
        }
    });
}
function savePortfolioReport(report) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const saved = yield db_1.db.userPortfolioPerformanceReport.create({
                data: {
                    userPortfolioId: report.userPortfolioId,
                    reportDate: report.reportDate,
                    totalCostPrice: report.totalCostPrice,
                    totalCloseValue: report.totalCloseValue,
                    totalLossGain: report.totalLossGain,
                    totalPercentage: report.totalPercentage,
                    totalFees: report.totalFees,
                    netAssetValue: report.netAssetValue,
                    assetBreakdown: {
                        create: report.assetBreakdown.map((b) => ({
                            assetClass: b.assetClass,
                            holdings: b.holdings,
                            totalCashValue: b.totalCashValue,
                            percentage: b.percentage,
                        })),
                    },
                    subPortfolioSnapshots: {
                        create: report.subPortfolioSnapshots.map((s) => ({
                            subPortfolioId: s.subPortfolioId,
                            generation: s.generation,
                            label: s.label,
                            amountInvested: s.amountInvested,
                            totalCostPrice: s.totalCostPrice,
                            totalCloseValue: s.totalCloseValue,
                            totalLossGain: s.totalLossGain,
                            totalFees: s.totalFees,
                            cashAtBank: s.cashAtBank,
                        })),
                    },
                },
            });
            return saved.id;
        }
        catch (error) {
            console.error("Error saving portfolio report:", error);
            return null;
        }
    });
}
function generateAndSaveReport(userPortfolioId_1) {
    return __awaiter(this, arguments, void 0, function* (userPortfolioId, reportDate = new Date()) {
        const report = yield generatePortfolioReport(userPortfolioId, reportDate);
        if (!report)
            return null;
        return savePortfolioReport(report);
    });
}
function generateDailyReportsForAllPortfolios() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("🚀 Starting daily report generation...");
        const allPortfolios = yield db_1.db.userPortfolio.findMany({
            where: { isActive: true },
            select: { id: true, userId: true },
        });
        let success = 0, failed = 0;
        const errors = [];
        const reportDate = new Date();
        reportDate.setHours(0, 0, 0, 0);
        for (const portfolio of allPortfolios) {
            try {
                const existing = yield db_1.db.userPortfolioPerformanceReport.findFirst({
                    where: {
                        userPortfolioId: portfolio.id,
                        reportDate: {
                            gte: reportDate,
                            lt: new Date(reportDate.getTime() + 24 * 60 * 60 * 1000),
                        },
                    },
                    select: { id: true },
                });
                if (existing) {
                    success++;
                    continue;
                }
                const reportId = yield generateAndSaveReport(portfolio.id, reportDate);
                if (reportId) {
                    success++;
                }
                else {
                    failed++;
                    errors.push(`Portfolio ${portfolio.id}: Failed to generate`);
                }
            }
            catch (error) {
                failed++;
                errors.push(`Portfolio ${portfolio.id}: ${error.message}`);
            }
        }
        console.log(`📊 Daily reports — total: ${allPortfolios.length}, ✅ ${success}, ❌ ${failed}`);
        return { success, failed, total: allPortfolios.length, errors };
    });
}
const REPORT_INCLUDE = {
    assetBreakdown: { orderBy: { assetClass: "asc" } },
    subPortfolioSnapshots: { orderBy: { generation: "asc" } },
};
function generatePerformanceReport(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userPortfolioId, reportDate } = req.body;
            if (!userPortfolioId) {
                return res.status(400).json({ data: null, error: "userPortfolioId is required" });
            }
            const portfolio = yield db_1.db.userPortfolio.findUnique({
                where: { id: userPortfolioId },
                select: { id: true, customName: true },
            });
            if (!portfolio)
                return res.status(404).json({ data: null, error: "Portfolio not found" });
            const date = reportDate ? new Date(reportDate) : new Date();
            date.setHours(0, 0, 0, 0);
            const reportId = yield generateAndSaveReport(userPortfolioId, date);
            if (!reportId) {
                return res.status(500).json({ data: null, error: "Failed to generate report" });
            }
            const report = yield db_1.db.userPortfolioPerformanceReport.findUnique({
                where: { id: reportId },
                include: REPORT_INCLUDE,
            });
            return res.status(201).json({ data: report, error: null });
        }
        catch (error) {
            console.error("generatePerformanceReport error:", error);
            return res.status(500).json({ data: null, error: "Failed to generate report" });
        }
    });
}
function generateUserPerformanceReports(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userId, reportDate } = req.body;
            if (!userId) {
                return res.status(400).json({ data: null, error: "userId is required" });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { id: true, firstName: true, lastName: true, email: true },
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            const activeCount = yield db_1.db.userPortfolio.count({ where: { userId, isActive: true } });
            if (!activeCount) {
                return res.status(404).json({ data: null, error: "No active portfolios found for this user" });
            }
            const result = yield generateDailyReportsForUser(userId);
            return res.status(200).json({
                data: Object.assign({ user: { id: user.id, email: user.email } }, result),
                error: result.failed > 0 ? `${result.failed} portfolio(s) failed` : null,
            });
        }
        catch (error) {
            console.error("generateUserPerformanceReports error:", error);
            return res.status(500).json({ data: null, error: "Failed to generate user reports" });
        }
    });
}
function generateAllPerformanceReports(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield generateDailyReportsForAllPortfolios();
            return res.status(200).json({
                data: result,
                message: `Generated ${result.success} reports, ${result.failed} failed`,
                error: null,
            });
        }
        catch (error) {
            console.error("generateAllPerformanceReports error:", error);
            return res.status(500).json({ data: null, error: "Failed to generate all reports" });
        }
    });
}
function getLatestPerformanceReport(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userPortfolioId } = req.params;
            const report = yield db_1.db.userPortfolioPerformanceReport.findFirst({
                where: { userPortfolioId },
                orderBy: { reportDate: "desc" },
                include: REPORT_INCLUDE,
            });
            if (!report) {
                return res.status(404).json({ data: null, error: "No reports found for this portfolio" });
            }
            return res.status(200).json({ data: report, error: null });
        }
        catch (error) {
            console.error("getLatestPerformanceReport error:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch latest report" });
        }
    });
}
function listPerformanceReports(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userPortfolioId, period, startDate, endDate } = req.query;
            if (!userPortfolioId) {
                return res.status(400).json({ data: null, error: "userPortfolioId is required" });
            }
            const reportPeriod = period !== null && period !== void 0 ? period : "daily";
            const now = new Date();
            let start = startDate ? new Date(startDate) : new Date(now);
            const end = endDate ? new Date(endDate) : now;
            if (!startDate) {
                switch (reportPeriod) {
                    case "daily":
                        start.setDate(now.getDate() - 1);
                        break;
                    case "weekly":
                        start.setDate(now.getDate() - 7);
                        break;
                    case "monthly":
                        start.setMonth(now.getMonth() - 1);
                        break;
                }
            }
            const reports = yield db_1.db.userPortfolioPerformanceReport.findMany({
                where: {
                    userPortfolioId,
                    reportDate: { gte: start, lte: end },
                },
                include: Object.assign(Object.assign({}, REPORT_INCLUDE), { userPortfolio: {
                        select: {
                            id: true, customName: true,
                            portfolio: { select: { id: true, name: true } },
                        },
                    } }),
                orderBy: { reportDate: "desc" },
            });
            return res.status(200).json({
                data: reports,
                meta: { count: reports.length, period: reportPeriod, startDate: start, endDate: end },
                error: null,
            });
        }
        catch (error) {
            console.error("listPerformanceReports error:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch performance reports" });
        }
    });
}
function getPerformanceReportById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { id } = req.params;
            const report = yield db_1.db.userPortfolioPerformanceReport.findUnique({
                where: { id },
                include: Object.assign(Object.assign({}, REPORT_INCLUDE), { userPortfolio: {
                        include: {
                            portfolio: true,
                            user: { select: { id: true, firstName: true, lastName: true, email: true } },
                        },
                    } }),
            });
            if (!report)
                return res.status(404).json({ data: null, error: "Report not found" });
            return res.status(200).json({ data: report, error: null });
        }
        catch (error) {
            console.error("getPerformanceReportById error:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch report" });
        }
    });
}
function getPerformanceStatistics(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { userPortfolioId } = req.params;
            const { period } = req.query;
            const reportPeriod = period !== null && period !== void 0 ? period : "monthly";
            const now = new Date();
            const start = new Date(now);
            switch (reportPeriod) {
                case "daily":
                    start.setDate(now.getDate() - 1);
                    break;
                case "weekly":
                    start.setDate(now.getDate() - 7);
                    break;
                case "monthly":
                    start.setMonth(now.getMonth() - 1);
                    break;
            }
            const reports = yield db_1.db.userPortfolioPerformanceReport.findMany({
                where: { userPortfolioId, reportDate: { gte: start, lte: now } },
                orderBy: { reportDate: "desc" },
            });
            if (!reports.length) {
                return res.status(404).json({ data: null, error: "No reports found for this period" });
            }
            const latest = reports[0];
            const oldest = reports[reports.length - 1];
            const totalGrowth = latest.totalCloseValue - oldest.totalCloseValue;
            const growthPercentage = oldest.totalCloseValue > 0 ? (totalGrowth / oldest.totalCloseValue) * 100 : 0;
            const avgDailyGain = reports.reduce((s, r) => s + r.totalLossGain, 0) / reports.length;
            const bestDay = reports.reduce((b, r) => r.totalLossGain > b.totalLossGain ? r : b);
            const worstDay = reports.reduce((w, r) => r.totalLossGain < w.totalLossGain ? r : w);
            return res.status(200).json({
                data: {
                    period: reportPeriod,
                    reportCount: reports.length,
                    currentValue: latest.totalCloseValue,
                    currentNAV: latest.netAssetValue,
                    currentFees: latest.totalFees,
                    startValue: oldest.totalCloseValue,
                    totalGrowth,
                    growthPercentage,
                    avgDailyGain,
                    bestDay: { date: bestDay.reportDate, gain: bestDay.totalLossGain, percentage: bestDay.totalPercentage },
                    worstDay: { date: worstDay.reportDate, loss: worstDay.totalLossGain, percentage: worstDay.totalPercentage },
                },
                error: null,
            });
        }
        catch (error) {
            console.error("getPerformanceStatistics error:", error);
            return res.status(500).json({ data: null, error: "Failed to calculate statistics" });
        }
    });
}
function cleanupPerformanceReports(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { daysToKeep } = req.body;
            const days = daysToKeep !== null && daysToKeep !== void 0 ? daysToKeep : 90;
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const deleted = yield db_1.db.userPortfolioPerformanceReport.deleteMany({
                where: { reportDate: { lt: cutoff } },
            });
            return res.status(200).json({
                data: { deletedCount: deleted.count },
                message: `Deleted ${deleted.count} old reports`,
                error: null,
            });
        }
        catch (error) {
            console.error("cleanupPerformanceReports error:", error);
            return res.status(500).json({ data: null, error: "Failed to cleanup old reports" });
        }
    });
}
function generateDailyReportsForUser(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const portfolios = yield db_1.db.userPortfolio.findMany({
            where: { userId, isActive: true },
            select: { id: true, customName: true },
            orderBy: { createdAt: "asc" },
        });
        const reportDate = new Date();
        reportDate.setHours(0, 0, 0, 0);
        let success = 0, skipped = 0, failed = 0;
        const errors = [];
        for (const up of portfolios) {
            try {
                const existing = yield db_1.db.userPortfolioPerformanceReport.findFirst({
                    where: {
                        userPortfolioId: up.id,
                        reportDate: {
                            gte: reportDate,
                            lt: new Date(reportDate.getTime() + 24 * 60 * 60 * 1000),
                        },
                    },
                    select: { id: true },
                });
                if (existing) {
                    skipped++;
                    continue;
                }
                const reportId = yield generateAndSaveReport(up.id, reportDate);
                if (reportId) {
                    success++;
                }
                else {
                    failed++;
                    errors.push(`[${up.customName}] Failed to generate`);
                }
            }
            catch (err) {
                failed++;
                errors.push(`[${up.customName}] ${err.message}`);
            }
        }
        return { total: portfolios.length, success, skipped, failed, errors };
    });
}
