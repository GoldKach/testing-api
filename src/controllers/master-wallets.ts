// src/controllers/master-wallets.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { Prisma } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Shared include                                                       */
/* ------------------------------------------------------------------ */

const MASTER_INCLUDE: Prisma.MasterWalletInclude = {
  user: {
    select: {
      id: true, firstName: true, lastName: true,
      email: true, phone: true, role: true, status: true,
    },
  },
};

/* ------------------------------------------------------------------ */
/*  LIST  GET /master-wallets                                           */
/* ------------------------------------------------------------------ */
export async function listMasterWallets(req: Request, res: Response) {
  try {
    const { status } = req.query as { status?: string };

    const wallets = await db.masterWallet.findMany({
      where:   status ? { status: status as any } : undefined,
      orderBy: { createdAt: "desc" },
      include: MASTER_INCLUDE,
    });

    return res.status(200).json({ data: wallets, error: null });
  } catch (err) {
    console.error("listMasterWallets error:", err);
    return res.status(500).json({ data: null, error: "Failed to list master wallets" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY USER  GET /master-wallets/user/:userId                       */
/* ------------------------------------------------------------------ */
/**
 * Returns the master wallet + a breakdown of all portfolio wallets
 * underneath it, so the frontend can show a full financial overview.
 */
export async function getMasterWalletByUser(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    let masterWallet = await db.masterWallet.findUnique({
      where:   { userId },
      include: { ...MASTER_INCLUDE },
    });

    // Auto-create master wallet if it doesn't exist (e.g. legacy users)
    if (!masterWallet) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) return res.status(404).json({ data: null, error: "User not found" });

      const accountNumber = `GK${Date.now().toString().slice(-9)}`;
      masterWallet = await db.masterWallet.create({
        data: {
          userId,
          accountNumber,
          balance:        0,
          totalDeposited: 0,
          totalWithdrawn: 0,
          totalFees:      0,
          netAssetValue:  0,
          status:         "ACTIVE",
        },
        include: { ...MASTER_INCLUDE },
      });
    }

    // Fetch all portfolio wallets for this user with their portfolio info
    const portfolioWallets = await db.portfolioWallet.findMany({
      where:   { userPortfolio: { userId } },
      orderBy: { createdAt: "desc" },
      include: {
        userPortfolio: {
          select: {
            id: true, customName: true, isActive: true,
            portfolioValue: true, totalInvested: true, totalLossGain: true,
            portfolio: { select: { id: true, name: true, riskTolerance: true, timeHorizon: true } },
          },
        },
      },
    });

    // Aggregate live totals across all active portfolio wallets
    const activeWallets      = portfolioWallets.filter((w) => w.userPortfolio?.isActive);
    const aggregateTotals = {
      totalBalance:     activeWallets.reduce((s, w) => s + w.balance,       0),
      totalNAV:         activeWallets.reduce((s, w) => s + w.netAssetValue,  0),
      totalFees:        activeWallets.reduce((s, w) => s + w.totalFees,      0),
      portfolioCount:   activeWallets.length,
    };

    return res.status(200).json({
      data: {
        masterWallet,
        portfolioWallets,
        aggregateTotals,
      },
      error: null,
    });
  } catch (err) {
    console.error("getMasterWalletByUser error:", err);
    return res.status(500).json({ data: null, error: "Failed to fetch master wallet" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY ID  GET /master-wallets/:id                                  */
/* ------------------------------------------------------------------ */
export async function getMasterWalletById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const wallet = await db.masterWallet.findUnique({
      where:   { id },
      include: MASTER_INCLUDE,
    });
    if (!wallet) return res.status(404).json({ data: null, error: "Master wallet not found" });

    return res.status(200).json({ data: wallet, error: null });
  } catch (err) {
    console.error("getMasterWalletById error:", err);
    return res.status(500).json({ data: null, error: "Failed to fetch master wallet" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE  PATCH /master-wallets/:id                                   */
/* ------------------------------------------------------------------ */
/** Admin-only: freeze/unfreeze or correct totals. */
export async function updateMasterWallet(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const current = await db.masterWallet.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ data: null, error: "Master wallet not found" });

    const { status, totalFees } = req.body as Partial<{ status: string; totalFees: number }>;

    const data: Prisma.MasterWalletUpdateInput = {};
    if (status    !== undefined) data.status    = status as any;
    if (totalFees !== undefined) data.totalFees = Number(totalFees);

    if (!Object.keys(data).length) {
      return res.status(400).json({ data: null, error: "No updatable fields provided" });
    }

    const updated = await db.masterWallet.update({ where: { id }, data, include: MASTER_INCLUDE });
    return res.status(200).json({ data: updated, error: null });
  } catch (err) {
    console.error("updateMasterWallet error:", err);
    return res.status(500).json({ data: null, error: "Failed to update master wallet" });
  }
}

/* ------------------------------------------------------------------ */
/*  SYNC  POST /master-wallets/sync/:userId                             */
/* ------------------------------------------------------------------ */
/**
 * Force-recalculate the master wallet NAV by summing all
 * PortfolioWallet NAVs for this user.
 * Useful if records get out of sync (e.g. after a migration).
 */
export async function syncMasterWalletForUser(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    const portfolioWallets = await db.portfolioWallet.findMany({
      where:  { userPortfolio: { userId } },
      select: { netAssetValue: true, totalFees: true, balance: true },
    });

    const totalNAV      = portfolioWallets.reduce((s, w) => s + w.netAssetValue, 0);
    const totalFees     = portfolioWallets.reduce((s, w) => s + w.totalFees,     0);
    const totalDeposited = await db.deposit.aggregate({
      where:  { userId, transactionStatus: "APPROVED" },
      _sum:   { amount: true },
    });
    const totalWithdrawn = await db.withdrawal.aggregate({
      where:  { userId, transactionStatus: "APPROVED" },
      _sum:   { amount: true },
    });

    const updated = await db.masterWallet.update({
      where: { userId },
      data: {
        netAssetValue:  totalNAV,
        totalFees,
        totalDeposited: totalDeposited._sum.amount ?? 0,
        totalWithdrawn: totalWithdrawn._sum.amount ?? 0,
      },
      include: MASTER_INCLUDE,
    });

    return res.status(200).json({ data: updated, error: null, message: "Master wallet synced" });
  } catch (err) {
    console.error("syncMasterWalletForUser error:", err);
    return res.status(500).json({ data: null, error: "Failed to sync master wallet" });
  }
}