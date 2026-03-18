// src/controllers/portfolio-performance-reports.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { AssetClass, Prisma } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface AssetBreakdown {
  assetClass:     AssetClass;
  holdings:       number;
  totalCashValue: number;
  percentage:     number;
}

interface SubPortfolioSnapshot {
  subPortfolioId:  string;
  generation:      number;
  label:           string;
  amountInvested:  number;
  totalCostPrice:  number;
  totalCloseValue: number;
  totalLossGain:   number;
  totalFees:       number;
  cashAtBank:      number;
}

interface GeneratedReport {
  userPortfolioId:      string;
  reportDate:           Date;
  totalCostPrice:       number;
  totalCloseValue:      number;
  totalLossGain:        number;
  totalPercentage:      number;
  totalFees:            number;
  netAssetValue:        number;
  assetBreakdown:       AssetBreakdown[];
  subPortfolioSnapshots: SubPortfolioSnapshot[];
}

/* ------------------------------------------------------------------ */
/*  Asset classification                                                */
/* ------------------------------------------------------------------ */

function determineAssetClass(asset: any): AssetClass {
  if (asset.assetClass) return asset.assetClass as AssetClass;

  const symbol      = (asset.symbol      ?? "").toLowerCase();
  const description = (asset.description ?? "").toLowerCase();
  const sector      = (asset.sector      ?? "").toLowerCase();

  if (
    description.includes("etf") ||
    description.includes("exchange traded fund") ||
    ["qqq", "spy", "voo", "iwm", "soxx", "xlk", "vti"].includes(symbol)
  ) return "ETFS";

  if (sector.includes("real estate") || sector.includes("reit") || description.includes("reit"))
    return "REITS";

  if (sector.includes("bond") || symbol.includes("bond") || description.includes("bond") || description.includes("treasury"))
    return "BONDS";

  if (symbol === "cash" || description === "cash" || symbol === "usd")
    return "CASH";

  return "EQUITIES";
}

/* ------------------------------------------------------------------ */
/*  Core: generate report from final merged (X2) positions only        */
/* ------------------------------------------------------------------ */

async function generatePortfolioReport(
  userPortfolioId: string,
  reportDate: Date = new Date()
): Promise<GeneratedReport | null> {
  try {
    const userPortfolio = await db.userPortfolio.findUnique({
      where: { id: userPortfolioId },
      include: {
        // PortfolioWallet — source of truth for fees and NAV
        wallet: true,
        // Final merged positions (X2) — these are the live totals after all top-ups
        userAssets: {
          include: { asset: true },
        },
        // Sub-portfolio slices for snapshot history (X, X1, X2-source...)
        subPortfolios: {
          orderBy: { generation: "asc" },
        },
      },
    });

    if (!userPortfolio) {
      console.error(`UserPortfolio ${userPortfolioId} not found`);
      return null;
    }

    const totalFees     = userPortfolio.wallet?.totalFees    ?? 0;
    const walletBalance = userPortfolio.wallet?.balance      ?? 0;

    // Empty portfolio — no assets yet
    if (userPortfolio.userAssets.length === 0) {
      return {
        userPortfolioId,
        reportDate,
        totalCostPrice:       0,
        totalCloseValue:      0,
        totalLossGain:        0,
        totalPercentage:      0,
        totalFees,
        netAssetValue:        walletBalance - totalFees,
        assetBreakdown:       [],
        subPortfolioSnapshots: [],
      };
    }

    // ── Compute totals from final merged (X2) UserPortfolioAsset rows ──
    // These already reflect the weighted-average across all top-up slices
    let totalCostPrice  = 0;
    let totalCloseValue = 0;
    let totalLossGain   = 0;

    const ALL_CLASSES: AssetClass[] = ["EQUITIES", "ETFS", "REITS", "BONDS", "CASH", "OTHERS"];
    const classMap = new Map<AssetClass, { holdings: number; totalCashValue: number }>();
    ALL_CLASSES.forEach((c) => classMap.set(c, { holdings: 0, totalCashValue: 0 }));

    for (const ua of userPortfolio.userAssets) {
      totalCostPrice  += ua.costPrice  ?? 0;
      totalCloseValue += ua.closeValue ?? 0;
      totalLossGain   += ua.lossGain   ?? 0;

      const cls   = determineAssetClass(ua.asset);
      const entry = classMap.get(cls)!;
      entry.holdings       += 1;
      entry.totalCashValue += ua.closeValue ?? 0;
    }

    const assetBreakdown: AssetBreakdown[] = Array.from(classMap.entries()).map(
      ([assetClass, data]) => ({
        assetClass,
        holdings:       data.holdings,
        totalCashValue: data.totalCashValue,
        percentage:     totalCloseValue > 0 ? (data.totalCashValue / totalCloseValue) * 100 : 0,
      })
    );

    const totalPercentage = totalCostPrice > 0 ? (totalLossGain / totalCostPrice) * 100 : 0;
    // NAV = final merged close value minus all accumulated fees
    const netAssetValue   = totalCloseValue - totalFees;

    // ── Sub-portfolio snapshots: historical record of each slice ──────
    // X (gen=0) = original investment, X1 (gen=1) = first top-up, etc.
    const subPortfolioSnapshots: SubPortfolioSnapshot[] = userPortfolio.subPortfolios.map((sub) => ({
      subPortfolioId:  sub.id,
      generation:      sub.generation,
      label:           sub.label,
      amountInvested:  sub.amountInvested,
      totalCostPrice:  sub.totalCostPrice,
      totalCloseValue: sub.totalCloseValue,
      totalLossGain:   sub.totalLossGain,
      totalFees:       sub.totalFees,
      cashAtBank:      sub.cashAtBank,
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
  } catch (error) {
    console.error("Error generating portfolio report:", error);
    return null;
  }
}

async function savePortfolioReport(report: GeneratedReport): Promise<string | null> {
  try {
    const saved = await db.userPortfolioPerformanceReport.create({
      data: {
        userPortfolioId: report.userPortfolioId,
        reportDate:      report.reportDate,
        totalCostPrice:  report.totalCostPrice,
        totalCloseValue: report.totalCloseValue,
        totalLossGain:   report.totalLossGain,
        totalPercentage: report.totalPercentage,
        totalFees:       report.totalFees,
        netAssetValue:   report.netAssetValue,
        assetBreakdown: {
          create: report.assetBreakdown.map((b) => ({
            assetClass:     b.assetClass,
            holdings:       b.holdings,
            totalCashValue: b.totalCashValue,
            percentage:     b.percentage,
          })),
        },
        subPortfolioSnapshots: {
          create: report.subPortfolioSnapshots.map((s) => ({
            subPortfolioId:  s.subPortfolioId,
            generation:      s.generation,
            label:           s.label,
            amountInvested:  s.amountInvested,
            totalCostPrice:  s.totalCostPrice,
            totalCloseValue: s.totalCloseValue,
            totalLossGain:   s.totalLossGain,
            totalFees:       s.totalFees,
            cashAtBank:      s.cashAtBank,
          })),
        },
      },
    });
    return saved.id;
  } catch (error) {
    console.error("Error saving portfolio report:", error);
    return null;
  }
}

async function generateAndSaveReport(
  userPortfolioId: string,
  reportDate: Date = new Date()
): Promise<string | null> {
  const report = await generatePortfolioReport(userPortfolioId, reportDate);
  if (!report) return null;
  return savePortfolioReport(report);
}

/* ------------------------------------------------------------------ */
/*  Cron helper — called by the daily job                               */
/* ------------------------------------------------------------------ */
export async function generateDailyReportsForAllPortfolios(): Promise<{
  success: number; failed: number; total: number; errors: string[];
}> {
  console.log("🚀 Starting daily report generation...");

  const allPortfolios = await db.userPortfolio.findMany({
    where:  { isActive: true },
    select: { id: true, userId: true },
  });

  let success = 0, failed = 0;
  const errors: string[] = [];

  const reportDate = new Date();
  reportDate.setHours(0, 0, 0, 0);

  for (const portfolio of allPortfolios) {
    try {
      const existing = await db.userPortfolioPerformanceReport.findFirst({
        where: {
          userPortfolioId: portfolio.id,
          reportDate: {
            gte: reportDate,
            lt:  new Date(reportDate.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
      });

      if (existing) { success++; continue; }

      const reportId = await generateAndSaveReport(portfolio.id, reportDate);
      if (reportId) { success++; }
      else {
        failed++;
        errors.push(`Portfolio ${portfolio.id}: Failed to generate`);
      }
    } catch (error: any) {
      failed++;
      errors.push(`Portfolio ${portfolio.id}: ${error.message}`);
    }
  }

  console.log(`📊 Daily reports — total: ${allPortfolios.length}, ✅ ${success}, ❌ ${failed}`);
  return { success, failed, total: allPortfolios.length, errors };
}

/* ------------------------------------------------------------------ */
/*  Shared report include                                               */
/* ------------------------------------------------------------------ */
const REPORT_INCLUDE: Prisma.UserPortfolioPerformanceReportInclude = {
  assetBreakdown:        { orderBy: { assetClass: "asc" } },
  subPortfolioSnapshots: { orderBy: { generation: "asc" } },
};

/* ------------------------------------------------------------------ */
/*  POST /portfolio-performance-reports/generate                        */
/*  Generate report for a single portfolio                              */
/* ------------------------------------------------------------------ */
export async function generatePerformanceReport(req: Request, res: Response) {
  try {
    const { userPortfolioId, reportDate } = req.body as {
      userPortfolioId?: string; reportDate?: string;
    };

    if (!userPortfolioId) {
      return res.status(400).json({ data: null, error: "userPortfolioId is required" });
    }

    const portfolio = await db.userPortfolio.findUnique({
      where:  { id: userPortfolioId },
      select: { id: true, customName: true },
    });
    if (!portfolio) return res.status(404).json({ data: null, error: "Portfolio not found" });

    const date = reportDate ? new Date(reportDate) : new Date();
    date.setHours(0, 0, 0, 0);

    const reportId = await generateAndSaveReport(userPortfolioId, date);
    if (!reportId) {
      return res.status(500).json({ data: null, error: "Failed to generate report" });
    }

    const report = await db.userPortfolioPerformanceReport.findUnique({
      where:   { id: reportId },
      include: REPORT_INCLUDE,
    });

    return res.status(201).json({ data: report, error: null });
  } catch (error) {
    console.error("generatePerformanceReport error:", error);
    return res.status(500).json({ data: null, error: "Failed to generate report" });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /portfolio-performance-reports/generate-for-user              */
/*  Generate reports for ALL portfolios belonging to a single user     */
/* ------------------------------------------------------------------ */
export async function generateUserPerformanceReports(req: Request, res: Response) {
  try {
    const { userId, reportDate } = req.body as {
      userId?: string; reportDate?: string;
    };

    if (!userId) {
      return res.status(400).json({ data: null, error: "userId is required" });
    }

    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    // Load all active portfolios for this user
    const userPortfolios = await db.userPortfolio.findMany({
      where:   { userId, isActive: true },
      select:  { id: true, customName: true },
      orderBy: { createdAt: "asc" },
    });

    if (!userPortfolios.length) {
      return res.status(404).json({ data: null, error: "No active portfolios found for this user" });
    }

    const date = reportDate ? new Date(reportDate) : new Date();
    date.setHours(0, 0, 0, 0);

    const results: {
      userPortfolioId: string;
      customName:      string;
      reportId:        string | null;
      status:          "generated" | "skipped" | "failed";
    }[] = [];

    for (const up of userPortfolios) {
      // Skip if a report already exists for this date
      const existing = await db.userPortfolioPerformanceReport.findFirst({
        where: {
          userPortfolioId: up.id,
          reportDate: {
            gte: date,
            lt:  new Date(date.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        select: { id: true },
      });

      if (existing) {
        results.push({ userPortfolioId: up.id, customName: up.customName, reportId: existing.id, status: "skipped" });
        continue;
      }

      const reportId = await generateAndSaveReport(up.id, date);
      results.push({
        userPortfolioId: up.id,
        customName:      up.customName,
        reportId,
        status: reportId ? "generated" : "failed",
      });
    }

    const summary = {
      total:     results.length,
      generated: results.filter((r) => r.status === "generated").length,
      skipped:   results.filter((r) => r.status === "skipped").length,
      failed:    results.filter((r) => r.status === "failed").length,
    };

    return res.status(200).json({
      data: { user: { id: user.id, email: user.email }, summary, results },
      error: summary.failed > 0 ? `${summary.failed} portfolio(s) failed` : null,
    });
  } catch (error) {
    console.error("generateUserPerformanceReports error:", error);
    return res.status(500).json({ data: null, error: "Failed to generate user reports" });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /portfolio-performance-reports/generate-all                    */
/*  Generate reports for every active portfolio in the system (cron)   */
/* ------------------------------------------------------------------ */
export async function generateAllPerformanceReports(req: Request, res: Response) {
  try {
    const result = await generateDailyReportsForAllPortfolios();
    return res.status(200).json({
      data:    result,
      message: `Generated ${result.success} reports, ${result.failed} failed`,
      error:   null,
    });
  } catch (error) {
    console.error("generateAllPerformanceReports error:", error);
    return res.status(500).json({ data: null, error: "Failed to generate all reports" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET /portfolio-performance-reports/latest/:userPortfolioId          */
/* ------------------------------------------------------------------ */
export async function getLatestPerformanceReport(req: Request, res: Response) {
  try {
    const { userPortfolioId } = req.params;

    const report = await db.userPortfolioPerformanceReport.findFirst({
      where:   { userPortfolioId },
      orderBy: { reportDate: "desc" },
      include: REPORT_INCLUDE,
    });

    if (!report) {
      return res.status(404).json({ data: null, error: "No reports found for this portfolio" });
    }

    return res.status(200).json({ data: report, error: null });
  } catch (error) {
    console.error("getLatestPerformanceReport error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch latest report" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET /portfolio-performance-reports                                  */
/* ------------------------------------------------------------------ */
export async function listPerformanceReports(req: Request, res: Response) {
  try {
    const { userPortfolioId, period, startDate, endDate } = req.query as {
      userPortfolioId?: string; period?: "daily" | "weekly" | "monthly";
      startDate?: string; endDate?: string;
    };

    if (!userPortfolioId) {
      return res.status(400).json({ data: null, error: "userPortfolioId is required" });
    }

    const reportPeriod = period ?? "daily";
    const now   = new Date();
    let   start = startDate ? new Date(startDate) : new Date(now);
    const end   = endDate   ? new Date(endDate)   : now;

    if (!startDate) {
      switch (reportPeriod) {
        case "daily":   start.setDate(now.getDate() - 1);   break;
        case "weekly":  start.setDate(now.getDate() - 7);   break;
        case "monthly": start.setMonth(now.getMonth() - 1); break;
      }
    }

    const reports = await db.userPortfolioPerformanceReport.findMany({
      where: {
        userPortfolioId,
        reportDate: { gte: start, lte: end },
      },
      include: {
        ...REPORT_INCLUDE,
        userPortfolio: {
          select: {
            id: true, customName: true,
            portfolio: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { reportDate: "desc" },
    });

    return res.status(200).json({
      data: reports,
      meta: { count: reports.length, period: reportPeriod, startDate: start, endDate: end },
      error: null,
    });
  } catch (error) {
    console.error("listPerformanceReports error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch performance reports" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET /portfolio-performance-reports/:id                              */
/* ------------------------------------------------------------------ */
export async function getPerformanceReportById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const report = await db.userPortfolioPerformanceReport.findUnique({
      where:   { id },
      include: {
        ...REPORT_INCLUDE,
        userPortfolio: {
          include: {
            portfolio: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!report) return res.status(404).json({ data: null, error: "Report not found" });
    return res.status(200).json({ data: report, error: null });
  } catch (error) {
    console.error("getPerformanceReportById error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch report" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET /portfolio-performance-reports/stats/:userPortfolioId           */
/* ------------------------------------------------------------------ */
export async function getPerformanceStatistics(req: Request, res: Response) {
  try {
    const { userPortfolioId } = req.params;
    const { period } = req.query as { period?: "daily" | "weekly" | "monthly" };

    const reportPeriod = period ?? "monthly";
    const now   = new Date();
    const start = new Date(now);

    switch (reportPeriod) {
      case "daily":   start.setDate(now.getDate() - 1);   break;
      case "weekly":  start.setDate(now.getDate() - 7);   break;
      case "monthly": start.setMonth(now.getMonth() - 1); break;
    }

    const reports = await db.userPortfolioPerformanceReport.findMany({
      where:   { userPortfolioId, reportDate: { gte: start, lte: now } },
      orderBy: { reportDate: "desc" },
    });

    if (!reports.length) {
      return res.status(404).json({ data: null, error: "No reports found for this period" });
    }

    const latest = reports[0];
    const oldest = reports[reports.length - 1];

    const totalGrowth      = latest.totalCloseValue - oldest.totalCloseValue;
    const growthPercentage = oldest.totalCloseValue > 0 ? (totalGrowth / oldest.totalCloseValue) * 100 : 0;
    const avgDailyGain     = reports.reduce((s, r) => s + r.totalLossGain, 0) / reports.length;
    const bestDay          = reports.reduce((b, r) => r.totalLossGain > b.totalLossGain ? r : b);
    const worstDay         = reports.reduce((w, r) => r.totalLossGain < w.totalLossGain ? r : w);

    return res.status(200).json({
      data: {
        period:           reportPeriod,
        reportCount:      reports.length,
        currentValue:     latest.totalCloseValue,
        currentNAV:       latest.netAssetValue,
        currentFees:      latest.totalFees,
        startValue:       oldest.totalCloseValue,
        totalGrowth,
        growthPercentage,
        avgDailyGain,
        bestDay:  { date: bestDay.reportDate,  gain: bestDay.totalLossGain,  percentage: bestDay.totalPercentage  },
        worstDay: { date: worstDay.reportDate, loss: worstDay.totalLossGain, percentage: worstDay.totalPercentage },
      },
      error: null,
    });
  } catch (error) {
    console.error("getPerformanceStatistics error:", error);
    return res.status(500).json({ data: null, error: "Failed to calculate statistics" });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /portfolio-performance-reports/cleanup                       */
/* ------------------------------------------------------------------ */
export async function cleanupPerformanceReports(req: Request, res: Response) {
  try {
    const { daysToKeep } = req.body as { daysToKeep?: number };
    const days   = daysToKeep ?? 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const deleted = await db.userPortfolioPerformanceReport.deleteMany({
      where: { reportDate: { lt: cutoff } },
    });

    return res.status(200).json({
      data:    { deletedCount: deleted.count },
      message: `Deleted ${deleted.count} old reports`,
      error:   null,
    });
  } catch (error) {
    console.error("cleanupPerformanceReports error:", error);
    return res.status(500).json({ data: null, error: "Failed to cleanup old reports" });
  }
}