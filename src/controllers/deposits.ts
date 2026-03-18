// src/controllers/deposits.ts
import { Request, Response } from "express";
import { Prisma, $Enums, UserRole } from "@prisma/client";
import { db } from "@/db/db";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

type TxStatus = $Enums.TransactionStatus;

const Status = {
  PENDING:  "PENDING"  as TxStatus,
  APPROVED: "APPROVED" as TxStatus,
  REJECTED: "REJECTED" as TxStatus,
} as const;

function num(v: unknown, def = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : def;
}

function asTxStatus(v: unknown): TxStatus | undefined {
  if (v == null) return undefined;
  const s = String(v).toUpperCase() as TxStatus;
  return [Status.PENDING, Status.APPROVED, Status.REJECTED].includes(s) ? s : undefined;
}

const SORTABLE_FIELDS = new Set<keyof Prisma.DepositOrderByWithRelationInput>([
  "createdAt", "amount", "transactionStatus",
]);

const DEPOSIT_INCLUDE: Prisma.DepositInclude = {
  user:           { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  createdBy:      { select: { id: true, firstName: true, lastName: true, role: true } },
  approvedBy:     { select: { id: true, firstName: true, lastName: true, role: true } },
  rejectedBy:     { select: { id: true, firstName: true, lastName: true, role: true } },
  portfolioWallet: true,
  userPortfolio:  { select: { id: true, customName: true, portfolioId: true } },
};

/* ------------------------------------------------------------------ */
/*  Top-up logic                                                        */
/*                                                                      */
/*  When an approved deposit targets an existing UserPortfolio,        */
/*  we create a new SubPortfolio (X1), then merge X + X1 into X2      */
/*  by recalculating the live UserPortfolioAsset records.              */
/* ------------------------------------------------------------------ */

async function applyTopup(
  tx: Prisma.TransactionClient,
  depositId: string,
  userPortfolioId: string,
  topupAmount: number
) {
  // Load the current portfolio with its wallet and live asset positions
  const up = await tx.userPortfolio.findUnique({
    where:   { id: userPortfolioId },
    include: {
      wallet:     true,
      userAssets: { include: { asset: { select: { id: true, closePrice: true } } } },
      subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
    },
  });

  if (!up || !up.wallet) throw new Error("UserPortfolio or PortfolioWallet not found");

  const prevTotal        = up.totalInvested;
  const nextGeneration   = (up.subPortfolios[0]?.generation ?? 0) + 1;
  const newTotalInvested = prevTotal + topupAmount;

  // Fee defaults (same as initial enrollment)
  const bankFee = 30, transactionFee = 10, feeAtBank = 10;
  const totalFees = bankFee + transactionFee + feeAtBank;

  // 1. Create SubPortfolio for this top-up slice (X1)
  //    Asset positions are proportioned from the top-up amount alone
  const subAssetRows = up.userAssets.map((ua) => {
    const costPrice  = (ua.allocationPercentage / 100) * topupAmount;
    const stock      = ua.costPerShare > 0 ? costPrice / ua.costPerShare : 0;
    const closeValue = ua.asset.closePrice * stock;
    const lossGain   = closeValue - costPrice;
    return { assetId: ua.assetId, allocationPercentage: ua.allocationPercentage, costPerShare: ua.costPerShare, costPrice, stock, closePrice: ua.asset.closePrice, closeValue, lossGain };
  });

  const subTotalCostPrice  = subAssetRows.reduce((s, r) => s + r.costPrice, 0);
  const subTotalCloseValue = subAssetRows.reduce((s, r) => s + r.closeValue, 0);
  const cashAtBank         = topupAmount - subTotalCostPrice;

  const sub = await tx.subPortfolio.create({
    data: {
      userPortfolioId,
      generation:      nextGeneration,
      label:           `${up.customName} - Top-up ${nextGeneration}`,
      amountInvested:  topupAmount,
      totalCostPrice:  subTotalCostPrice,
      totalCloseValue: subTotalCloseValue,
      totalLossGain:   subTotalCloseValue - subTotalCostPrice,
      bankFee, transactionFee, feeAtBank, totalFees,
      cashAtBank,
      snapshotDate:    new Date(),
    },
  });

  if (subAssetRows.length) {
    await tx.subPortfolioAsset.createMany({
      data: subAssetRows.map((r) => ({ subPortfolioId: sub.id, ...r })),
      skipDuplicates: true,
    });
  }

  // 2. Recalculate merged (X2) live positions using newTotalInvested as NAV
  let newTotalCloseValue = 0;
  let newTotalCostPrice  = 0;

  for (const ua of up.userAssets) {
    const costPrice  = (ua.allocationPercentage / 100) * newTotalInvested;
    const stock      = ua.costPerShare > 0 ? costPrice / ua.costPerShare : 0;
    const closeValue = ua.asset.closePrice * stock;
    const lossGain   = closeValue - costPrice;

    await tx.userPortfolioAsset.update({
      where: { id: ua.id },
      data:  { costPrice, stock, closeValue, lossGain },
    });

    newTotalCloseValue += closeValue;
    newTotalCostPrice  += costPrice;
  }

  const newTotalFees      = up.wallet.totalFees + totalFees;
  const newNetAssetValue  = newTotalCloseValue - newTotalFees;

  // 3. Update UserPortfolio totals
  await tx.userPortfolio.update({
    where: { id: userPortfolioId },
    data: {
      portfolioValue: newTotalCloseValue,
      totalInvested:  newTotalInvested,
      totalLossGain:  newTotalCloseValue - newTotalInvested,
    },
  });

  // 4. Update PortfolioWallet
  await tx.portfolioWallet.update({
    where: { id: up.wallet.id },
    data: {
      balance:       { increment: topupAmount },
      totalFees:     newTotalFees,
      netAssetValue: newNetAssetValue,
    },
  });

  // 5. Create TopupEvent audit record
  await tx.topupEvent.create({
    data: {
      userPortfolioId,
      depositId,
      topupAmount,
      previousTotal:       prevTotal,
      newTotalInvested,
      newTotalCloseValue,
      newTotalLossGain:    newTotalCloseValue - newTotalInvested,
      newTotalFees,
      newNetAssetValue,
      status:              "MERGED",
      mergedAt:            new Date(),
      mergedSubPortfolios: { connect: { id: sub.id } },
    },
  });

  return { newTotalCloseValue, newNetAssetValue };
}

/**
 * Sync MasterWallet by summing all PortfolioWallet NAVs for this user.
 */
async function syncMasterWallet(tx: Prisma.TransactionClient, userId: string) {
  const wallets = await tx.portfolioWallet.findMany({
    where:  { userPortfolio: { userId } },
    select: { netAssetValue: true },
  });
  const totalNav = wallets.reduce((s, w) => s + (w.netAssetValue ?? 0), 0);
  await tx.masterWallet.updateMany({
    where: { userId },
    data:  { netAssetValue: totalNav },
  });
}

/* ------------------------------------------------------------------ */
/*  LIST  GET /deposits                                                  */
/* ------------------------------------------------------------------ */
export async function listDeposits(req: Request, res: Response) {
  try {
    const q                 = (req.query.q as string) || "";
    const userId            = (req.query.userId as string) || "";
    const userPortfolioId   = (req.query.userPortfolioId as string) || "";
    const portfolioWalletId = (req.query.portfolioWalletId as string) || "";
    const createdById       = (req.query.createdById as string) || "";
    const status            = asTxStatus(req.query.status);

    const page     = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const sortByRaw = (req.query.sortBy as string) || "createdAt";
    const sortBy   = SORTABLE_FIELDS.has(sortByRaw as any) ? (sortByRaw as any) : "createdAt";
    const order    = ((req.query.order as string) === "asc" ? "asc" : "desc") as "asc" | "desc";

    const where: Prisma.DepositWhereInput = {
      AND: [
        userId            ? { userId }            : {},
        userPortfolioId   ? { userPortfolioId }   : {},
        portfolioWalletId ? { portfolioWalletId } : {},
        createdById       ? { createdById }       : {},
        status            ? { transactionStatus: status } : {},
        q ? {
          OR: [
            { referenceNo:   { contains: q, mode: "insensitive" } },
            { mobileNo:      { contains: q, mode: "insensitive" } },
            { accountNo:     { contains: q, mode: "insensitive" } },
            { description:   { contains: q, mode: "insensitive" } },
            { createdByName: { contains: q, mode: "insensitive" } },
          ],
        } : {},
      ],
    };

    const [total, items] = await db.$transaction([
      db.deposit.count({ where }),
      db.deposit.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
        include: DEPOSIT_INCLUDE,
      }),
    ]);

    return res.status(200).json({
      data: items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      error: null,
    });
  } catch (error) {
    console.error("listDeposits error:", error);
    return res.status(500).json({ data: null, error: "Failed to list deposits" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY ID  GET /deposits/:id                                         */
/* ------------------------------------------------------------------ */
export async function getDepositById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const row = await db.deposit.findUnique({ where: { id }, include: DEPOSIT_INCLUDE });
    if (!row) return res.status(404).json({ data: null, error: "Deposit not found" });
    return res.status(200).json({ data: row, error: null });
  } catch (error) {
    console.error("getDepositById error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch deposit" });
  }
}

/* ------------------------------------------------------------------ */
/*  CREATE  POST /deposits                                               */
/* ------------------------------------------------------------------ */
/**
 * Deposit requests are created by admins/agents on behalf of a client.
 * Always starts as PENDING — no wallet changes until approved.
 *
 * Body: {
 *   userId, userPortfolioId,
 *   amount, depositTarget?,
 *   createdById, createdByName, createdByRole,
 *   mobileNo?, referenceNo?, accountNo?, method?, description?,
 *   transactionId?
 * }
 */
export async function createDeposit(req: Request, res: Response) {
  try {
    const {
      userId, userPortfolioId,
      amount, depositTarget,
      transactionId, mobileNo, referenceNo,
      accountNo, method, description,
      createdById, createdByName, createdByRole,
    } = req.body as Partial<{
      userId: string; userPortfolioId: string;
      amount: number | string; depositTarget: string;
      transactionId: string; mobileNo: string; referenceNo: string;
      accountNo: string; method: string; description: string;
      createdById: string; createdByName: string; createdByRole: string;
    }>;

    const amt = num(amount, NaN);
    if (!userId || !userPortfolioId || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({
        data: null,
        error: "userId, userPortfolioId and a positive amount are required",
      });
    }

    // Verify user and portfolio exist, portfolio belongs to user
    const [user, userPortfolio] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { id: true } }),
      db.userPortfolio.findUnique({
        where:  { id: userPortfolioId },
        select: { id: true, userId: true, wallet: { select: { id: true } } },
      }),
    ]);

    if (!user)          return res.status(404).json({ data: null, error: "User not found" });
    if (!userPortfolio) return res.status(404).json({ data: null, error: "Portfolio not found" });
    if (userPortfolio.userId !== userId) {
      return res.status(403).json({ data: null, error: "Portfolio does not belong to this user" });
    }

    const created = await db.deposit.create({
      data: {
        userId,
        userPortfolioId,
        portfolioWalletId: userPortfolio.wallet?.id ?? null,
        depositTarget:     (depositTarget as any) ?? "PORTFOLIO",
        amount:            amt,
        transactionStatus: Status.PENDING,
        transactionId:     transactionId  ?? null,
        mobileNo:          mobileNo       ?? null,
        referenceNo:       referenceNo    ?? null,
        accountNo:         accountNo      ?? null,
        method:            method         ?? null,
        description:       description    ?? null,
        createdById:       createdById    ?? null,
        createdByName:     createdByName  ?? null,
        createdByRole:     (createdByRole as UserRole) ?? null,
      },
      include: DEPOSIT_INCLUDE,
    });

    return res.status(201).json({ data: created, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("createDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to create deposit" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE  PATCH /deposits/:id                                          */
/* ------------------------------------------------------------------ */
/** Only PENDING deposits can be edited. Status changes go through approve/reject. */
export async function updateDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });
    if (existing.transactionStatus !== Status.PENDING) {
      return res.status(409).json({ data: null, error: "Only PENDING deposits can be updated" });
    }

    const {
      amount, transactionId, mobileNo, referenceNo,
      accountNo, method, description,
    } = req.body as Partial<{
      amount: number | string; transactionId: string;
      mobileNo: string; referenceNo: string; accountNo: string;
      method: string; description: string;
    }>;

    const data: Prisma.DepositUpdateInput = {};
    if (amount !== undefined) {
      const a = num(amount, NaN);
      if (!Number.isFinite(a) || a <= 0) {
        return res.status(400).json({ data: null, error: "amount must be > 0" });
      }
      data.amount = a;
    }
    if (transactionId !== undefined) data.transactionId = transactionId;
    if (mobileNo      !== undefined) data.mobileNo      = mobileNo;
    if (referenceNo   !== undefined) data.referenceNo   = referenceNo;
    if (accountNo     !== undefined) data.accountNo     = accountNo;
    if (method        !== undefined) data.method        = method;
    if (description   !== undefined) data.description   = description;

    const updated = await db.deposit.update({ where: { id }, data, include: DEPOSIT_INCLUDE });
    return res.status(200).json({ data: updated, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("updateDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to update deposit" });
  }
}

/* ------------------------------------------------------------------ */
/*  APPROVE  POST /deposits/:id/approve                                  */
/* ------------------------------------------------------------------ */
/**
 * PENDING → APPROVED
 * 1. Mark deposit approved + record approver
 * 2. If targeting an existing UserPortfolio → run top-up logic
 *    (creates SubPortfolio X1, merges into X2, creates TopupEvent)
 * 3. Update PortfolioWallet + MasterWallet
 */
export async function approveDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { approvedById, approvedByName, transactionId } =
      (req.body ?? {}) as { approvedById?: string; approvedByName?: string; transactionId?: string };

    const existing = await db.deposit.findUnique({
      where:   { id },
      include: { portfolioWallet: { select: { id: true, netAssetValue: true, totalFees: true } } },
    });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });

    if (existing.transactionStatus === Status.APPROVED) {
      return res.status(200).json({ data: existing, error: null }); // idempotent
    }
    if (existing.transactionStatus === Status.REJECTED) {
      return res.status(409).json({ data: null, error: "Cannot approve a rejected deposit" });
    }

    const approved = await db.$transaction(async (tx) => {
      // 1. Mark approved
      const row = await tx.deposit.update({
        where: { id },
        data: {
          transactionStatus: Status.APPROVED,
          transactionId:     transactionId  ?? existing.transactionId ?? null,
          approvedById:      approvedById   ?? null,
          approvedByName:    approvedByName ?? null,
          approvedAt:        new Date(),
        },
      });

      // 2. Top-up or initial portfolio funding
      if (existing.userPortfolioId) {
        await applyTopup(tx, id, existing.userPortfolioId, existing.amount);
      } else if (existing.portfolioWalletId) {
        // Deposit to master wallet only — update portfolio wallet balance
        await tx.portfolioWallet.update({
          where: { id: existing.portfolioWalletId },
          data:  { balance: { increment: existing.amount }, netAssetValue: { increment: existing.amount } },
        });
      }

      // 3. Update MasterWallet totals
      await tx.masterWallet.updateMany({
        where: { userId: existing.userId },
        data:  { totalDeposited: { increment: existing.amount } },
      });

      // 4. Sync master wallet NAV
      await syncMasterWallet(tx, existing.userId);

      return row;
    });

    const result = await db.deposit.findUnique({ where: { id: approved.id }, include: DEPOSIT_INCLUDE });
    return res.status(200).json({ data: result, error: null });
  } catch (error) {
    console.error("approveDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to approve deposit" });
  }
}

/* ------------------------------------------------------------------ */
/*  REJECT  POST /deposits/:id/reject                                    */
/* ------------------------------------------------------------------ */
export async function rejectDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { rejectedById, rejectedByName, reason } =
      (req.body ?? {}) as { rejectedById?: string; rejectedByName?: string; reason?: string };

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });

    if (existing.transactionStatus === Status.REJECTED) {
      return res.status(200).json({ data: existing, error: null }); // idempotent
    }
    if (existing.transactionStatus === Status.APPROVED) {
      return res.status(409).json({
        data: null,
        error: "Cannot reject an approved deposit. Use the reverse endpoint instead.",
      });
    }

    const rejected = await db.deposit.update({
      where: { id },
      data: {
        transactionStatus: Status.REJECTED,
        rejectedById:      rejectedById   ?? null,
        rejectedByName:    rejectedByName ?? null,
        rejectedAt:        new Date(),
        rejectReason:      reason         ?? null,
      },
      include: DEPOSIT_INCLUDE,
    });

    return res.status(200).json({ data: rejected, error: null });
  } catch (error) {
    console.error("rejectDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to reject deposit" });
  }
}

/* ------------------------------------------------------------------ */
/*  REVERSE  POST /deposits/:id/reverse                                  */
/* ------------------------------------------------------------------ */
/**
 * Reverses an APPROVED deposit:
 * - Decrements PortfolioWallet balance + NAV
 * - Syncs MasterWallet
 * - Does NOT undo SubPortfolio history (kept for audit)
 * - Marks deposit as REJECTED
 */
export async function reverseDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { rejectedById, rejectedByName, reason } =
      (req.body ?? {}) as { rejectedById?: string; rejectedByName?: string; reason?: string };

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });

    if (existing.transactionStatus === Status.REJECTED) {
      return res.status(200).json({ data: existing, error: null }); // idempotent
    }
    if (existing.transactionStatus === Status.PENDING) {
      return res.status(409).json({ data: null, error: "Deposit is still PENDING. Use reject instead." });
    }

    const reversed = await db.$transaction(async (tx) => {
      const row = await tx.deposit.update({
        where: { id },
        data: {
          transactionStatus: Status.REJECTED,
          rejectedById:      rejectedById   ?? null,
          rejectedByName:    rejectedByName ?? null,
          rejectedAt:        new Date(),
          rejectReason:      reason ?? "Reversed",
        },
      });

      // Deduct from portfolio wallet
      if (existing.portfolioWalletId) {
        await tx.portfolioWallet.update({
          where: { id: existing.portfolioWalletId },
          data: {
            balance:       { decrement: existing.amount },
            netAssetValue: { decrement: existing.amount },
          },
        });
      }

      // Update master wallet totals
      await tx.masterWallet.updateMany({
        where: { userId: existing.userId },
        data:  { totalDeposited: { decrement: existing.amount } },
      });

      await syncMasterWallet(tx, existing.userId);

      return row;
    });

    const result = await db.deposit.findUnique({ where: { id: reversed.id }, include: DEPOSIT_INCLUDE });
    return res.status(200).json({ data: result, error: null });
  } catch (error) {
    console.error("reverseDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to reverse deposit" });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE  DELETE /deposits/:id                                         */
/* ------------------------------------------------------------------ */
/** Only PENDING deposits may be deleted. */
export async function deleteDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });
    if (existing.transactionStatus === Status.APPROVED) {
      return res.status(409).json({
        data: null,
        error: "Cannot delete an approved deposit. Reverse it first.",
      });
    }

    await db.deposit.delete({ where: { id } });
    return res.status(200).json({ data: null, error: null, message: "Deposit deleted" });
  } catch (error) {
    console.error("deleteDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to delete deposit" });
  }
}