// src/controllers/sub-portfolios.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { Prisma } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Shared include                                                       */
/* ------------------------------------------------------------------ */

const SUB_INCLUDE: Prisma.SubPortfolioInclude = {
  assets:       { include: { asset: true }, orderBy: { createdAt: "asc" } },
  userPortfolio: { select: { id: true, customName: true, userId: true, portfolioId: true } },
  mergedByTopup: { select: { id: true, status: true, mergedAt: true, topupAmount: true } },
};

/* ------------------------------------------------------------------ */
/*  LIST  GET /sub-portfolios?userPortfolioId=...&generation=...        */
/* ------------------------------------------------------------------ */
/**
 * List all sub-portfolio slices for a given UserPortfolio.
 * generation=0 is the original "X", 1 is first top-up "X1", etc.
 */
export async function listSubPortfolios(req: Request, res: Response) {
  try {
    const { userPortfolioId, generation } = req.query as {
      userPortfolioId?: string;
      generation?: string;
    };

    if (!userPortfolioId) {
      return res.status(400).json({ data: null, error: "userPortfolioId is required" });
    }

    // Verify portfolio exists and caller has access
    const up = await db.userPortfolio.findUnique({
      where:  { id: userPortfolioId },
      select: { id: true, customName: true },
    });
    if (!up) return res.status(404).json({ data: null, error: "UserPortfolio not found" });

    const where: Prisma.SubPortfolioWhereInput = {
      userPortfolioId,
      ...(generation !== undefined ? { generation: parseInt(generation, 10) } : {}),
    };

    const items = await db.subPortfolio.findMany({
      where,
      orderBy: { generation: "asc" },
      include: SUB_INCLUDE,
    });

    return res.status(200).json({ data: items, error: null });
  } catch (err) {
    console.error("listSubPortfolios error:", err);
    return res.status(500).json({ data: null, error: "Failed to list sub-portfolios" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY ID  GET /sub-portfolios/:id                                  */
/* ------------------------------------------------------------------ */
export async function getSubPortfolioById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const sub = await db.subPortfolio.findUnique({
      where:   { id },
      include: SUB_INCLUDE,
    });
    if (!sub) return res.status(404).json({ data: null, error: "SubPortfolio not found" });

    return res.status(200).json({ data: sub, error: null });
  } catch (err) {
    console.error("getSubPortfolioById error:", err);
    return res.status(500).json({ data: null, error: "Failed to fetch sub-portfolio" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE  PATCH /sub-portfolios/:id                                   */
/* ------------------------------------------------------------------ */
/**
 * Allows admin to correct snapshot figures (e.g. after a data entry error).
 * Does NOT recalculate UserPortfolioAssets — use the recompute endpoint for that.
 */
export async function updateSubPortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const current = await db.subPortfolio.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ data: null, error: "SubPortfolio not found" });

    const {
      label, amountInvested, totalCostPrice, totalCloseValue,
      bankFee, transactionFee, feeAtBank, cashAtBank, snapshotDate,
    } = req.body as Partial<{
      label: string; amountInvested: number; totalCostPrice: number;
      totalCloseValue: number; bankFee: number; transactionFee: number;
      feeAtBank: number; cashAtBank: number; snapshotDate: string;
    }>;

    const data: Prisma.SubPortfolioUpdateInput = {};
    if (label            !== undefined) data.label            = label;
    if (amountInvested   !== undefined) data.amountInvested   = amountInvested;
    if (totalCostPrice   !== undefined) data.totalCostPrice   = totalCostPrice;
    if (cashAtBank       !== undefined) data.cashAtBank       = cashAtBank;
    if (snapshotDate     !== undefined) data.snapshotDate     = new Date(snapshotDate);

    if (totalCloseValue !== undefined) {
      data.totalCloseValue = totalCloseValue;
      const costBasis = totalCostPrice ?? current.totalCostPrice;
      data.totalLossGain = totalCloseValue - costBasis;
    }

    // Recompute fee totals if any fee component changed
    const nextBankFee       = bankFee       ?? current.bankFee;
    const nextTransFee      = transactionFee ?? current.transactionFee;
    const nextFeeAtBank     = feeAtBank     ?? current.feeAtBank;
    if (bankFee !== undefined || transactionFee !== undefined || feeAtBank !== undefined) {
      data.bankFee       = nextBankFee;
      data.transactionFee = nextTransFee;
      data.feeAtBank     = nextFeeAtBank;
      data.totalFees     = nextBankFee + nextTransFee + nextFeeAtBank;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ data: null, error: "No updatable fields provided" });
    }

    const updated = await db.subPortfolio.update({ where: { id }, data, include: SUB_INCLUDE });
    return res.status(200).json({ data: updated, error: null });
  } catch (err) {
    console.error("updateSubPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to update sub-portfolio" });
  }
}