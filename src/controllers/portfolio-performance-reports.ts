// src/controllers/portfolio-performance-reports.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { AssetClass, Prisma } from "@prisma/client";

/* --------------------------------- Types --------------------------------- */

interface AssetBreakdown {
  assetClass: AssetClass;
  holdings: number;
  totalCashValue: number;
  percentage: number;
}

export interface AssetDetailRow {
  symbol: string | null;
  description: string | null;
  sector: string | null;

  stocks: number;         // userAsset.quantity
  allocation: number;     // userAsset.allocation

  costPerShare: number;
  costPrice: number;
  closePrice: number;
  closeValue: number;
  lossGain: number;
}



/* ----------------------- Asset Classification ----------------------- */

/**
 * Determine asset class from asset data
 * Customize this based on your classification rules
 */
function determineAssetClass(asset: any): AssetClass {
  // 1. Check if asset has explicit assetClass field
  if (asset.assetClass) {
    return asset.assetClass as AssetClass;
  }

  // 2. Check by symbol or description patterns
  const symbol = (asset.symbol || "").toLowerCase();
  const description = (asset.description || "").toLowerCase();
  const sector = (asset.sector || "").toLowerCase();

  // ETFs - common patterns
  if (
    description.includes("etf") ||
    description.includes("exchange traded fund") ||
    ["qqq", "spy", "voo", "iwm", "soxx", "xlk", "vti"].includes(symbol)
  ) {
    return "ETFS";
  }

  // REITs - real estate
  if (
    sector.includes("real estate") ||
    sector.includes("reit") ||
    description.includes("reit")
  ) {
    return "REITS";
  }

  // Bonds - fixed income
  if (
    sector.includes("bond") ||
    symbol.includes("bond") ||
    description.includes("bond") ||
    description.includes("treasury")
  ) {
    return "BONDS";
  }

  // Cash positions
  if (symbol === "cash" || description === "cash" || symbol === "usd") {
    return "CASH";
  }

  // Default to EQUITIES for stocks
  return "EQUITIES";
}

/* ----------------------- Report Generation ----------------------- */

/**
 * Generate a performance report for a single user portfolio
 */
async function generatePortfolioReport(
  userPortfolioId: string,
  reportDate: Date = new Date()
): Promise<any | null> {
  try {
    // Fetch the user portfolio with all assets
    const userPortfolio = await db.userPortfolio.findUnique({
      where: { id: userPortfolioId },
      include: {
        userAssets: {
          include: {
            portfolioAsset: {
              include: {
                asset: true,
              },
            },
          },
        },
      },
    });

    if (!userPortfolio) {
      console.error(`UserPortfolio ${userPortfolioId} not found`);
      return null;
    }

    // If no assets, still create report with zeros
    if (userPortfolio.userAssets.length === 0) {
      return {
        userPortfolioId,
        reportDate,
        totalCostPrice: 0,
        totalCloseValue: 0,
        totalLossGain: 0,
        totalPercentage: 0,
        assetBreakdown: [],
      };
    }

    // Calculate totals
    let totalCostPrice = 0;
    let totalCloseValue = 0;
    let totalLossGain = 0;

    // Group assets by class
    const assetClassMap = new Map<
      AssetClass,
      { holdings: number; totalCashValue: number; assets: any[] }
    >();

    // Initialize all asset classes with zero values
    const allAssetClasses: AssetClass[] = [
      "EQUITIES",
      "ETFS",
      "REITS",
      "BONDS",
      "CASH",
      "OTHERS",
    ];

    allAssetClasses.forEach((assetClass) => {
      assetClassMap.set(assetClass, {
        holdings: 0,
        totalCashValue: 0,
        assets: [],
      });
    });

    // Process each asset
    for (const userAsset of userPortfolio.userAssets) {
      const asset = userAsset.portfolioAsset.asset;
      const closeValue = userAsset.closeValue || 0;
      const costPrice = userAsset.costPrice || 0;
      const lossGain = userAsset.lossGain || 0;

      totalCostPrice += costPrice;
      totalCloseValue += closeValue;
      totalLossGain += lossGain;

      // Determine asset class
      const assetClass = determineAssetClass(asset);

      // Get or create the asset class entry
      const classData = assetClassMap.get(assetClass)!;
      classData.holdings += 1;
      classData.totalCashValue += closeValue;
      classData.assets.push(asset);
    }

    // Calculate percentages and create breakdown
    const assetBreakdown: AssetBreakdown[] = [];

    for (const [assetClass, data] of assetClassMap.entries()) {
      const percentage =
        totalCloseValue > 0 ? (data.totalCashValue / totalCloseValue) * 100 : 0;

      assetBreakdown.push({
        assetClass,
        holdings: data.holdings,
        totalCashValue: data.totalCashValue,
        percentage,
      });
    }

    const totalPercentage =
      totalCostPrice > 0 ? (totalLossGain / totalCostPrice) * 100 : 0;

    return {
      userPortfolioId,
      reportDate,
      totalCostPrice,
      totalCloseValue,
      totalLossGain,
      totalPercentage,
      assetBreakdown,
    };
  } catch (error) {
    console.error("Error generating portfolio report:", error);
    return null;
  }
}


// export async function generatePortfolioReport(
//   userPortfolioId: string,
//   reportDate: Date = new Date()
// ): Promise<any | null> {
//   try {
//     // 1. Fetch portfolio with all related assets
//     const userPortfolio = await db.userPortfolio.findUnique({
//       where: { id: userPortfolioId },
//       include: {
//         userAssets: {
//           include: {
//             portfolioAsset: {
//               include: {
//                 asset: true, // Symbol, description, sector, asset-level cost/close etc.
//               },
//             },
//           },
//         },
//       },
//     });

//     if (!userPortfolio) {
//       console.error(`UserPortfolio ${userPortfolioId} not found`);
//       return null;
//     }

//     if (!userPortfolio.userAssets || userPortfolio.userAssets.length === 0) {
//       return {
//         userPortfolioId,
//         reportDate,
//         totalCostPrice: 0,
//         totalCloseValue: 0,
//         totalLossGain: 0,
//         totalPercentage: 0,
//         assetBreakdown: [],
//         assetDetails: [],
//         screenshotUrl: "/mnt/data/355f4e58-7df7-4581-a19a-2c6df92316b9.png",
//       };
//     }

//     let totalCostPrice = 0;
//     let totalCloseValue = 0;
//     let totalLossGain = 0;

//     const assetClassMap = new Map<
//       AssetClass,
//       { holdings: number; totalCashValue: number; assets: any[] }
//     >();

//     const allAssetClasses: AssetClass[] = [
//       "EQUITIES",
//       "ETFS",
//       "REITS",
//       "BONDS",
//       "CASH",
//       "OTHERS",
//     ];

//     allAssetClasses.forEach((assetClass) => {
//       assetClassMap.set(assetClass, {
//         holdings: 0,
//         totalCashValue: 0,
//         assets: [],
//       });
//     });

//     // Keep using the interface you already have
//     const assetDetails: AssetDetailRow[] = [];

//     for (const userAsset of userPortfolio.userAssets) {
//       const assetRecord = userAsset.portfolioAsset?.asset;

//       const shares =
//         Number(userAsset.quantity ?? userAsset.shares ?? userAsset.amount ?? 0) || 0;

//       const costPerShare = Number(
//         userAsset.costPerShare ?? assetRecord?.costPerShare ?? 0
//       );

//       const closePrice = Number(userAsset.closePrice ?? assetRecord?.closePrice ?? 0);

//       const costPrice =
//         Number(userAsset.costPrice ?? 0) || Number((shares * costPerShare) || 0);

//       const closeValue =
//         Number(userAsset.closeValue ?? 0) || Number((shares * closePrice) || 0);

//       const lossGain =
//         Number(userAsset.lossGain ?? 0) || Number(closeValue - costPrice);

//       totalCostPrice += costPrice;
//       totalCloseValue += closeValue;
//       totalLossGain += lossGain;

//       const assetClass = determineAssetClass(assetRecord) as AssetClass;
//       const classData = assetClassMap.get(assetClass)!;

//       // If holdings should be number of distinct assets use +1, if total shares use += shares
//       classData.holdings += 1; // <-- counting distinct assets
//       classData.totalCashValue += closeValue;
//       classData.assets.push(assetRecord);

//       // **Fixed mapping: `stocks` is required by AssetDetailRow, so assign shares => stocks**
//       const detail: AssetDetailRow = {
//         symbol: assetRecord?.symbol ?? null,
//         description: assetRecord?.description ?? null,
//         sector: assetRecord?.sector ?? null,

//         // required property in your type
//         stocks: shares,                // <-- mapped here

//         // keep allocation as number (percent)
//         allocation: Number(userAsset.allocation ?? assetRecord?.allocationPercentage ?? 0),

//         costPerShare,
//         costPrice,
//         closePrice,
//         closeValue,
//         lossGain,

//         // optional ids (your AssetDetailRow may include these keys)
//         assetId: assetRecord?.id,
//         portfolioAssetId: userAsset.portfolioAsset?.id,
//       } as AssetDetailRow;

//       assetDetails.push(detail);
//     }

//     const assetBreakdown: AssetBreakdown[] = [];

//     for (const [assetClass, data] of assetClassMap.entries()) {
//       const percentage =
//         totalCloseValue > 0 ? (data.totalCashValue / totalCloseValue) * 100 : 0;

//       assetBreakdown.push({
//         assetClass,
//         holdings: data.holdings,
//         totalCashValue: data.totalCashValue,
//         percentage,
//       });
//     }

//     const totalPercentage =
//       totalCostPrice > 0 ? (totalLossGain / totalCostPrice) * 100 : 0;

//     return {
//       userPortfolioId,
//       reportDate,
//       totalCostPrice,
//       totalCloseValue,
//       totalLossGain,
//       totalPercentage,
//       assetBreakdown,
//       assetDetails,
//       screenshotUrl: "/mnt/data/355f4e58-7df7-4581-a19a-2c6df92316b9.png",
//     };
//   } catch (error) {
//     console.error("Error generating portfolio report:", error);
//     return null;
//   }
// }




/**
 * Save a generated report to the database
 */
async function savePortfolioReport(
  report:any
): Promise<string | null> {
  try {
    const saved = await db.userPortfolioPerformanceReport.create({
      data: {
        userPortfolioId: report.userPortfolioId,
        reportDate: report.reportDate,
        totalCostPrice: report.totalCostPrice,
        totalCloseValue: report.totalCloseValue,
        totalLossGain: report.totalLossGain,
        totalPercentage: report.totalPercentage,
        assetBreakdown: {
          create: report.assetBreakdown.map((breakdown:any) => ({
            assetClass: breakdown.assetClass,
            holdings: breakdown.holdings,
            totalCashValue: breakdown.totalCashValue,
            percentage: breakdown.percentage,
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

/**
 * Generate and save report for a single portfolio
 */
async function generateAndSaveReport(
  userPortfolioId: string,
  reportDate: Date = new Date()
): Promise<string | null> {
  const report = await generatePortfolioReport(userPortfolioId, reportDate);
  if (!report) return null;
  return await savePortfolioReport(report);
}

/**
 * Generate reports for all active user portfolios
 * This is called by the cron job every 24 hours
 */
export async function generateDailyReportsForAllPortfolios(): Promise<{
  success: number;
  failed: number;
  total: number;
  errors: string[];
}> {
  try {
    console.log("🚀 Starting daily report generation for all portfolios...");

    const allPortfolios = await db.userPortfolio.findMany({
      select: { id: true, userId: true },
    });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const reportDate = new Date();
    reportDate.setHours(0, 0, 0, 0); // Normalize to start of day

    for (const portfolio of allPortfolios) {
      try {
        // Check if report already exists for today
        const existingReport = await db.userPortfolioPerformanceReport.findFirst({
          where: {
            userPortfolioId: portfolio.id,
            reportDate: {
              gte: reportDate,
              lt: new Date(reportDate.getTime() + 24 * 60 * 60 * 1000),
            },
          },
        });

        if (existingReport) {
          console.log(`⏭️  Report already exists for portfolio ${portfolio.id}`);
          success++;
          continue;
        }

        const reportId = await generateAndSaveReport(portfolio.id, reportDate);
        if (reportId) {
          success++;
          console.log(`✅ Generated report for portfolio ${portfolio.id}`);
        } else {
          failed++;
          errors.push(`Portfolio ${portfolio.id}: Failed to generate`);
          console.error(`❌ Failed to generate report for portfolio ${portfolio.id}`);
        }
      } catch (error: any) {
        failed++;
        const errorMsg = `Portfolio ${portfolio.id}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ Error for portfolio ${portfolio.id}:`, error);
      }
    }

    console.log(`\n📊 Daily Report Generation Summary:`);
    console.log(`   Total portfolios: ${allPortfolios.length}`);
    console.log(`   ✅ Success: ${success}`);
    console.log(`   ❌ Failed: ${failed}`);

    return {
      success,
      failed,
      total: allPortfolios.length,
      errors,
    };
  } catch (error) {
    console.error("❌ Fatal error in generateDailyReportsForAllPortfolios:", error);
    return { success: 0, failed: 0, total: 0, errors: [(error as Error).message] };
  }
}

/* ----------------------------- API ENDPOINTS ----------------------------- */

/**
 * POST /api/portfolio-performance-reports/generate
 * Generate report manually for a specific portfolio
 */
export async function generatePerformanceReport(req: Request, res: Response) {
  try {
    const { userPortfolioId, reportDate } = req.body as {
      userPortfolioId?: string;
      reportDate?: string;
    };

    if (!userPortfolioId) {
      return res.status(400).json({
        data: null,
        error: "userPortfolioId is required",
      });
    }

    // Verify portfolio exists
    const portfolio = await db.userPortfolio.findUnique({
      where: { id: userPortfolioId },
    });

    if (!portfolio) {
      return res.status(404).json({
        data: null,
        error: "Portfolio not found",
      });
    }

    const date = reportDate ? new Date(reportDate) : new Date();
    date.setHours(0, 0, 0, 0);

    const reportId = await generateAndSaveReport(userPortfolioId, date);

    if (!reportId) {
      return res.status(500).json({
        data: null,
        error: "Failed to generate report",
      });
    }

    // Fetch the created report
    const report = await db.userPortfolioPerformanceReport.findUnique({
      where: { id: reportId },
      include: {
        assetBreakdown: {
          orderBy: { assetClass: "asc" },
        },
      },
    });

    return res.status(201).json({
      data: report,
      error: null,
    });
  } catch (error) {
    console.error("generatePerformanceReport error:", error);
    return res.status(500).json({
      data: null,
      error: "Failed to generate report",
    });
  }
}

/**
 * POST /api/portfolio-performance-reports/generate-all
 * Generate reports for all portfolios (called by cron job)
 */
export async function generateAllPerformanceReports(
  req: Request,
  res: Response
) {
  try {
    const result = await generateDailyReportsForAllPortfolios();

    return res.status(200).json({
      data: result,
      message: `Generated ${result.success} reports successfully, ${result.failed} failed`,
      error: null,
    });
  } catch (error) {
    console.error("generateAllPerformanceReports error:", error);
    return res.status(500).json({
      data: null,
      error: "Failed to generate reports for all portfolios",
    });
  }
}

/**
 * GET /api/portfolio-performance-reports/latest/:userPortfolioId
 * Get the latest report for a portfolio
 */
export async function getLatestPerformanceReport(req: Request, res: Response) {
  try {
    const { userPortfolioId } = req.params;

    if (!userPortfolioId) {
      return res.status(400).json({
        data: null,
        error: "userPortfolioId is required",
      });
    }

    const report = await db.userPortfolioPerformanceReport.findFirst({
      where: { userPortfolioId },
      include: {
        assetBreakdown: {
          orderBy: { assetClass: "asc" },
        },
      },
      orderBy: {
        reportDate: "desc",
      },
    });

    if (!report) {
      return res.status(404).json({
        data: null,
        error: "No reports found for this portfolio",
      });
    }

    return res.status(200).json({
      data: report,
      error: null,
    });
  } catch (error) {
    console.error("getLatestPerformanceReport error:", error);
    return res.status(500).json({
      data: null,
      error: "Failed to fetch latest report",
    });
  }
}

/**
 * GET /api/portfolio-performance-reports?userPortfolioId=xxx&period=daily|weekly|monthly
 * Get reports for a specific period
 */
export async function listPerformanceReports(req: Request, res: Response) {
  try {
    const { userPortfolioId, period, startDate, endDate } = req.query as {
      userPortfolioId?: string;
      period?: "daily" | "weekly" | "monthly";
      startDate?: string;
      endDate?: string;
    };

    if (!userPortfolioId) {
      return res.status(400).json({
        data: null,
        error: "userPortfolioId is required",
      });
    }

    const reportPeriod = period || "daily";
    const now = new Date();
    let start = startDate ? new Date(startDate) : new Date();
    let end = endDate ? new Date(endDate) : now;

    // Calculate date range based on period if not provided
    if (!startDate) {
      switch (reportPeriod) {
        case "daily":
          start = new Date(now);
          start.setDate(now.getDate() - 1);
          break;
        case "weekly":
          start = new Date(now);
          start.setDate(now.getDate() - 7);
          break;
        case "monthly":
          start = new Date(now);
          start.setMonth(now.getMonth() - 1);
          break;
      }
    }

    const reports = await db.userPortfolioPerformanceReport.findMany({
      where: {
        userPortfolioId,
        reportDate: {
          gte: start,
          lte: end,
        },
      },
      include: {
        assetBreakdown: {
          orderBy: { assetClass: "asc" },
        },
        userPortfolio:{
          include:{
            userAssets:{
              include:{
                portfolioAsset:{
                  include:{
                    asset:true
                  }
                }
              }
            },
            portfolio:true
          }
        }
      },
      orderBy: {
        reportDate: "desc",
      },
    });

    return res.status(200).json({
      data: reports,
      meta: {
        count: reports.length,
        period: reportPeriod,
        startDate: start,
        endDate: end,
      },
      error: null,
    });
  } catch (error) {
    console.error("listPerformanceReports error:", error);
    return res.status(500).json({
      data: null,
      error: "Failed to fetch performance reports",
    });
  }
}

/**
 * GET /api/portfolio-performance-reports/:id
 * Get specific report by ID
 */
export async function getPerformanceReportById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const report = await db.userPortfolioPerformanceReport.findUnique({
      where: { id },
      include: {
        assetBreakdown: {
          orderBy: { assetClass: "asc" },
        },
        userPortfolio: {
          include: {
            portfolio: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!report) {
      return res.status(404).json({
        data: null,
        error: "Report not found",
      });
    }

    return res.status(200).json({
      data: report,
      error: null,
    });
  } catch (error) {
    console.error("getPerformanceReportById error:", error);
    return res.status(500).json({
      data: null,
      error: "Failed to fetch report",
    });
  }
}

/**
 * GET /api/portfolio-performance-reports/stats/:userPortfolioId?period=monthly
 * Get performance statistics
 */
export async function getPerformanceStatistics(req: Request, res: Response) {
  try {
    const { userPortfolioId } = req.params;
    const { period } = req.query as { period?: "daily" | "weekly" | "monthly" };

    const reportPeriod = period || "monthly";
    const now = new Date();
    let start = new Date();

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

    const reports = await db.userPortfolioPerformanceReport.findMany({
      where: {
        userPortfolioId,
        reportDate: { gte: start, lte: now },
      },
      orderBy: { reportDate: "desc" },
    });

    if (reports.length === 0) {
      return res.status(404).json({
        data: null,
        error: "No reports found for this period",
      });
    }

    const latest = reports[0];
    const oldest = reports[reports.length - 1];

    const totalGrowth = latest.totalCloseValue - oldest.totalCloseValue;
    const growthPercentage =
      oldest.totalCloseValue > 0
        ? (totalGrowth / oldest.totalCloseValue) * 100
        : 0;

    const avgDailyGain =
      reports.reduce((sum, r) => sum + r.totalLossGain, 0) / reports.length;

    const bestDay = reports.reduce((best, r) =>
      r.totalLossGain > best.totalLossGain ? r : best
    );

    const worstDay = reports.reduce((worst, r) =>
      r.totalLossGain < worst.totalLossGain ? r : worst
    );

    return res.status(200).json({
      data: {
        period: reportPeriod,
        reportCount: reports.length,
        currentValue: latest.totalCloseValue,
        startValue: oldest.totalCloseValue,
        totalGrowth,
        growthPercentage,
        avgDailyGain,
        bestDay: {
          date: bestDay.reportDate,
          gain: bestDay.totalLossGain,
          percentage: bestDay.totalPercentage,
        },
        worstDay: {
          date: worstDay.reportDate,
          loss: worstDay.totalLossGain,
          percentage: worstDay.totalPercentage,
        },
      },
      error: null,
    });
  } catch (error) {
    console.error("getPerformanceStatistics error:", error);
    return res.status(500).json({
      data: null,
      error: "Failed to calculate statistics",
    });
  }
}

/**
 * DELETE /api/portfolio-performance-reports/cleanup
 * Cleanup old reports (keep last 90 days by default)
 */
export async function cleanupPerformanceReports(req: Request, res: Response) {
  try {
    const { daysToKeep } = req.body as { daysToKeep?: number };
    const days = daysToKeep || 90;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const deleted = await db.userPortfolioPerformanceReport.deleteMany({
      where: {
        reportDate: {
          lt: cutoffDate,
        },
      },
    });

    return res.status(200).json({
      data: { deletedCount: deleted.count },
      message: `Deleted ${deleted.count} old reports`,
      error: null,
    });
  } catch (error) {
    console.error("cleanupPerformanceReports error:", error);
    return res.status(500).json({
      data: null,
      error: "Failed to cleanup old reports",
    });
  }
}