// src/controllers/portfolio-wallets.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { Prisma } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Shared include                                                       */
/* ------------------------------------------------------------------ */

const WALLET_INCLUDE: Prisma.PortfolioWalletInclude = {
  userPortfolio: {
    select: {
      id: true, customName: true, userId: true,
      portfolioValue: true, totalInvested: true, totalLossGain: true,
      portfolio: { select: { id: true, name: true } },
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  },
};

/* ------------------------------------------------------------------ */
/*  LIST  GET /portfolio-wallets?userId=...                             */
/* ------------------------------------------------------------------ */
export async function listPortfolioWallets(req: Request, res: Response) {
  try {
    const { userId, status } = req.query as { userId?: string; status?: string };

    const where: Prisma.PortfolioWalletWhereInput = {
      ...(userId ? { userPortfolio: { userId } } : {}),
      ...(status ? { status: status as any }     : {}),
    };

    const wallets = await db.portfolioWallet.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: WALLET_INCLUDE,
    });

    return res.status(200).json({ data: wallets, error: null });
  } catch (err) {
    console.error("listPortfolioWallets error:", err);
    return res.status(500).json({ data: null, error: "Failed to list portfolio wallets" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY ID  GET /portfolio-wallets/:id                               */
/* ------------------------------------------------------------------ */
export async function getPortfolioWalletById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const wallet = await db.portfolioWallet.findUnique({
      where:   { id },
      include: WALLET_INCLUDE,
    });
    if (!wallet) return res.status(404).json({ data: null, error: "Portfolio wallet not found" });

    return res.status(200).json({ data: wallet, error: null });
  } catch (err) {
    console.error("getPortfolioWalletById error:", err);
    return res.status(500).json({ data: null, error: "Failed to fetch portfolio wallet" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY PORTFOLIO  GET /portfolio-wallets/portfolio/:userPortfolioId */
/* ------------------------------------------------------------------ */
export async function getPortfolioWalletByPortfolio(req: Request, res: Response) {
  try {
    const { userPortfolioId } = req.params;

    const wallet = await db.portfolioWallet.findUnique({
      where:   { userPortfolioId },
      include: WALLET_INCLUDE,
    });
    if (!wallet) return res.status(404).json({ data: null, error: "Portfolio wallet not found" });

    return res.status(200).json({ data: wallet, error: null });
  } catch (err) {
    console.error("getPortfolioWalletByPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to fetch portfolio wallet" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE  PATCH /portfolio-wallets/:id                                */
/* ------------------------------------------------------------------ */
/**
 * Admin-only: manually correct fee structure or freeze/unfreeze a wallet.
 * Does NOT touch balance or NAV — those are managed via deposit/withdrawal flows.
 */
export async function updatePortfolioWallet(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const current = await db.portfolioWallet.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ data: null, error: "Portfolio wallet not found" });

    const { bankFee, transactionFee, feeAtBank, status } = req.body as Partial<{
      bankFee: number; transactionFee: number; feeAtBank: number; status: string;
    }>;

    const data: Prisma.PortfolioWalletUpdateInput = {};

    const nextBankFee   = bankFee       !== undefined ? Number(bankFee)       : current.bankFee;
    const nextTransFee  = transactionFee !== undefined ? Number(transactionFee) : current.transactionFee;
    const nextFeeAtBank = feeAtBank     !== undefined ? Number(feeAtBank)     : current.feeAtBank;

    if (bankFee !== undefined || transactionFee !== undefined || feeAtBank !== undefined) {
      data.bankFee       = nextBankFee;
      data.transactionFee = nextTransFee;
      data.feeAtBank     = nextFeeAtBank;
      data.totalFees     = nextBankFee + nextTransFee + nextFeeAtBank;
      // Recompute NAV with updated fees
      data.netAssetValue = current.balance - (nextBankFee + nextTransFee + nextFeeAtBank);
    }

    if (status !== undefined) data.status = status as any;

    if (!Object.keys(data).length) {
      return res.status(400).json({ data: null, error: "No updatable fields provided" });
    }

    const updated = await db.portfolioWallet.update({ where: { id }, data, include: WALLET_INCLUDE });
    return res.status(200).json({ data: updated, error: null });
  } catch (err) {
    console.error("updatePortfolioWallet error:", err);
    return res.status(500).json({ data: null, error: "Failed to update portfolio wallet" });
  }
}