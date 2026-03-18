// src/controllers/portfolio-summary.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";

/* ------------------------------------------------------------------ */
/*  GET  GET /portfolio-summary/:userId                                 */
/* ------------------------------------------------------------------ */
/**
 * Returns a complete financial snapshot for a user:
 * - Master wallet totals
 * - Per-portfolio breakdown (wallet, assets, sub-portfolios, top-up history)
 * - Aggregated performance across all portfolios
 * - Latest performance report per portfolio
 */
export async function getPortfolioSummary(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    const [masterWallet, userPortfolios] = await Promise.all([
      db.masterWallet.findUnique({
        where: { userId },
        select: {
          id: true, accountNumber: true,
          totalDeposited: true, totalWithdrawn: true,
          totalFees: true, netAssetValue: true, status: true,
        },
      }),
      db.userPortfolio.findMany({
        where:   { userId, isActive: true },
        orderBy: { createdAt: "asc" },
        include: {
          portfolio: { select: { id: true, name: true, riskTolerance: true, timeHorizon: true } },
          wallet: true,
          userAssets: {
            include: { asset: { select: { id: true, symbol: true, description: true, assetClass: true, closePrice: true } } },
          },
          subPortfolios: {
            orderBy: { generation: "asc" },
            select: {
              id: true, generation: true, label: true,
              amountInvested: true, totalCostPrice: true,
              totalCloseValue: true, totalLossGain: true,
              totalFees: true, cashAtBank: true, snapshotDate: true,
            },
          },
          topupEvents: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true, topupAmount: true, previousTotal: true,
              newTotalInvested: true, newTotalCloseValue: true,
              newNetAssetValue: true, newTotalFees: true,
              status: true, mergedAt: true, createdAt: true,
            },
          },
        },
      }),
    ]);

    // Fetch the latest performance report per portfolio
    const reportMap = new Map<string, any>();
    await Promise.all(
      userPortfolios.map(async (up) => {
        const report = await db.userPortfolioPerformanceReport.findFirst({
          where:   { userPortfolioId: up.id },
          orderBy: { reportDate: "desc" },
          include: { assetBreakdown: true, subPortfolioSnapshots: { orderBy: { generation: "asc" } } },
        });
        if (report) reportMap.set(up.id, report);
      })
    );

    // Build per-portfolio summary
    const portfolios = userPortfolios.map((up) => ({
      id:             up.id,
      customName:     up.customName,
      portfolio:      up.portfolio,
      wallet:         up.wallet,
      totalInvested:  up.totalInvested,
      portfolioValue: up.portfolioValue,
      totalLossGain:  up.totalLossGain,
      returnPct:      up.totalInvested > 0 ? (up.totalLossGain / up.totalInvested) * 100 : 0,
      assets:         up.userAssets,
      subPortfolios:  up.subPortfolios,
      topupHistory:   up.topupEvents,
      latestReport:   reportMap.get(up.id) ?? null,
    }));

    // Aggregate across all active portfolios
    const totalInvested  = portfolios.reduce((s, p) => s + p.totalInvested,  0);
    const totalGainLoss  = portfolios.reduce((s, p) => s + p.totalLossGain,  0);

    const aggregate = {
      totalInvested,
      totalValue:     portfolios.reduce((s, p) => s + p.portfolioValue, 0),
      totalGainLoss,
      totalFees:      portfolios.reduce((s, p) => s + (p.wallet?.totalFees ?? 0), 0),
      portfolioCount: portfolios.length,
      returnPct:      totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0,
    };

    return res.status(200).json({
      data: {
        user,
        masterWallet,
        aggregate,
        portfolios,
      },
      error: null,
    });
  } catch (err) {
    console.error("getPortfolioSummary error:", err);
    return res.status(500).json({ data: null, error: "Failed to fetch portfolio summary" });
  }
}

/* ------------------------------------------------------------------ */
/*  REFRESH  POST /portfolio-summary/:userId/refresh                    */
/* ------------------------------------------------------------------ */
/**
 * Force-recompute all live UserPortfolioAsset positions for every
 * active portfolio of this user, then sync the master wallet.
 * Useful after bulk asset price updates (e.g. end-of-day close prices).
 */
export async function refreshPortfolioSummary(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    const userPortfolios = await db.userPortfolio.findMany({
      where:   { userId, isActive: true },
      include: {
        wallet:     { select: { id: true, netAssetValue: true, totalFees: true } },
        userAssets: {
          include: { asset: { select: { id: true, closePrice: true } } },
        },
      },
    });

    const results: { portfolioId: string; customName: string; newValue: number }[] = [];

    await db.$transaction(async (tx) => {
      for (const up of userPortfolios) {
        if (!up.wallet) continue;

        const nav = up.wallet.netAssetValue;
        let totalValue = 0;
        let totalCost  = 0;

        for (const ua of up.userAssets) {
          const costPrice  = (ua.allocationPercentage / 100) * nav;
          const stock      = ua.costPerShare > 0 ? costPrice / ua.costPerShare : 0;
          const closeValue = ua.asset.closePrice * stock;
          const lossGain   = closeValue - costPrice;

          await tx.userPortfolioAsset.update({
            where: { id: ua.id },
            data:  { costPrice, stock, closeValue, lossGain },
          });

          totalValue += closeValue;
          totalCost  += costPrice;
        }

        await tx.userPortfolio.update({
          where: { id: up.id },
          data: {
            portfolioValue: totalValue,
            totalInvested:  totalCost,
            totalLossGain:  totalValue - totalCost,
          },
        });

        await tx.portfolioWallet.update({
          where: { id: up.wallet.id },
          data:  { netAssetValue: totalValue - up.wallet.totalFees },
        });

        results.push({ portfolioId: up.id, customName: up.customName, newValue: totalValue });
      }

      // Sync master wallet NAV
      const wallets = await tx.portfolioWallet.findMany({
        where:  { userPortfolio: { userId } },
        select: { netAssetValue: true },
      });
      const totalNAV = wallets.reduce((s, w) => s + w.netAssetValue, 0);
      await tx.masterWallet.updateMany({
        where: { userId },
        data:  { netAssetValue: totalNAV },
      });
    });

    return res.status(200).json({
      data:    results,
      message: `Refreshed ${results.length} portfolios`,
      error:   null,
    });
  } catch (err) {
    console.error("refreshPortfolioSummary error:", err);
    return res.status(500).json({ data: null, error: "Failed to refresh portfolio summary" });
  }
}