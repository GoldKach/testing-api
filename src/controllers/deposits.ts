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
  user:            { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  createdBy:       { select: { id: true, firstName: true, lastName: true, role: true } },
  approvedBy:      { select: { id: true, firstName: true, lastName: true, role: true } },
  rejectedBy:      { select: { id: true, firstName: true, lastName: true, role: true } },
  portfolioWallet: true,
  masterWallet:    true,
  userPortfolio:   { select: { id: true, customName: true, portfolioId: true } },
};

/* ------------------------------------------------------------------ */
/*  Top-up logic (ALLOCATION: master wallet → portfolio wallet)        */
/*                                                                      */
/*  Creates SubPortfolio (X1), merges into X2 live positions,          */
/*  creates TopupEvent audit record.                                  */
/*                                                                      */
/*  NOTE: Fees are no longer deducted during allocation.              */
/*  All fees (maintenance, management) are deducted from master wallet.*/
/* ------------------------------------------------------------------ */

async function applyTopup(
  tx: Prisma.TransactionClient,
  depositId: string,
  userPortfolioId: string,
  topupAmount: number,
  /** assetId → { costPerShare, closePrice } provided by staff at approval time */
  assetPrices: Record<string, { costPerShare: number; closePrice: number }> = {}
) {
  const up = await tx.userPortfolio.findUnique({
    where:   { id: userPortfolioId },
    include: {
      wallet:        true,
      userAssets:    { include: { asset: { select: { id: true, closePrice: true } } } },
      subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
    },
  });

  if (!up || !up.wallet) throw new Error("UserPortfolio or PortfolioWallet not found");

  const prevTotal        = up.totalInvested;
  const nextGeneration   = (up.subPortfolios[0]?.generation ?? 0) + 1;
  const newTotalInvested = prevTotal + topupAmount;

  // Fees are now 0 during allocation - all fees deducted from master wallet
  const bankFee        = 0;
  const transactionFee = 0;
  const feeAtBank     = 0;
  const totalFees      = 0;

  // Sub-portfolio NAV = full topup amount (no fees deducted)
  const topupNAV = topupAmount;

  // ─── 1. Sub-portfolio (X1) ─────────────────────────────────────────────────
  // allocation% adopted from mother; closePrice entered by staff at approval;
  // costPrice (A) = allocationPct × topupNAV; stock = costPrice / closePrice;
  // closeValue = closePrice × stock; lossGain = closeValue − costPrice
  const subAssetRows = up.userAssets.map((ua) => {
    const provided      = assetPrices[ua.assetId];
    const effectiveCPS  = provided?.costPerShare ?? ua.costPerShare;
    const effectiveCP   = provided?.closePrice   ?? ua.asset.closePrice;
    const costPrice  = (ua.allocationPercentage / 100) * topupNAV;
    // stock = costPrice / closePrice (admin-provided close price at approval)
    const stock      = effectiveCP > 0 ? costPrice / effectiveCP : 0;
    const closeValue = effectiveCP * stock;
    const lossGain   = closeValue - costPrice;
    return {
      assetId:              ua.assetId,
      allocationPercentage: ua.allocationPercentage,
      costPerShare:         effectiveCPS,
      costPrice, stock,
      closePrice:           effectiveCP,
      closeValue, lossGain,
    };
  });

  // Map assetId → topup stock so we can accumulate into mother portfolio
  const topupStockByAsset = new Map<string, number>(
    subAssetRows.map((r) => [r.assetId, r.stock])
  );

  const subTotalCostPrice  = subAssetRows.reduce((s, r) => s + r.costPrice, 0);
  const subTotalCloseValue = subAssetRows.reduce((s, r) => s + r.closeValue, 0);
  // cashAtBank = undeployed amount (topupAmount − cost allocated to assets)
  const cashAtBank = topupAmount - subTotalCostPrice;

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
      snapshotDate: new Date(),
    },
  });

  if (subAssetRows.length) {
    await tx.subPortfolioAsset.createMany({
      data: subAssetRows.map((r) => ({ subPortfolioId: sub.id, ...r })),
      skipDuplicates: true,
    });
  }

  // ─── New mother portfolio (X2 merge) ──────────────────────────────────────
  // For each asset:
  //   costPriceA   = allocation% × topupAmount        ← new money into this asset
  //   topupStock   = costPriceA / approvalClosePrice   ← shares bought this top-up
  //   stock        = oldStock + topupStock             ← accumulated
  //   allocation%  = unchanged
  //   newCostPrice = oldCostPrice + costPriceA         ← cumulative cost basis
  //   costPerShare = newCostPrice / newStock            ← weighted average
  //   closeValue   = newStock × asset.closePrice        ← today's live price
  //   lossGain     = closeValue − newCostPrice
  const newNetAssetValue = newTotalInvested;

  // 2. Merge into mother portfolio using cumulative cost basis formula.
  const assetUpdates = up.userAssets.map((ua) => {
    const provided        = assetPrices[ua.assetId];
    const approvalClose   = provided?.closePrice ?? (ua.asset.closePrice ?? 0);
    const costPriceA      = (ua.allocationPercentage / 100) * topupAmount;
    const topupStock      = approvalClose > 0 ? costPriceA / approvalClose : 0;
    const newStock        = (ua.stock ?? 0) + topupStock;
    const newCostPrice    = (ua.costPrice ?? 0) + costPriceA;
    const newCostPerShare = newStock > 0 ? newCostPrice / newStock : 0;
    const closeValue      = (ua.asset.closePrice ?? 0) * newStock;
    const lossGain        = closeValue - newCostPrice;
    return { id: ua.id, stock: newStock, costPrice: newCostPrice, costPerShare: newCostPerShare, closeValue, lossGain };
  });

  await Promise.all(
    assetUpdates.map((a) =>
      tx.userPortfolioAsset.update({
        where: { id: a.id },
        data:  { stock: a.stock, costPrice: a.costPrice, costPerShare: a.costPerShare, closeValue: a.closeValue, lossGain: a.lossGain },
      })
    )
  );

  const newTotalCloseValue = assetUpdates.reduce((s, a) => s + a.closeValue, 0);

  // 3. Update UserPortfolio totals
  await tx.userPortfolio.update({
    where: { id: userPortfolioId },
    data: {
      portfolioValue: newTotalCloseValue,        // market value (for performance display)
      totalInvested:  newTotalInvested,
      totalLossGain:  newTotalCloseValue - newTotalInvested,
    },
  });

  // 4. Update PortfolioWallet — increment balance and NAV (no fees)
  await tx.portfolioWallet.update({
    where: { id: up.wallet.id },
    data: {
      balance:       { increment: topupAmount },
      totalFees:     0,
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
      newTotalFees:       0,
      newNetAssetValue,
      status:              "MERGED",
      mergedAt:            new Date(),
      mergedSubPortfolios: { connect: { id: sub.id } },
    },
  });

  return { newTotalCloseValue, newNetAssetValue };
}

/**
 * Sync MasterWallet.netAssetValue = Σ userPortfolio.portfolioValue (market value).
 * portfolioWallet.netAssetValue is the cost-basis NAV — do NOT sum that here.
 * Does NOT touch MasterWallet.balance (cash available — managed separately).
 */
async function syncMasterWalletNav(tx: Prisma.TransactionClient, userId: string) {
  const portfolios = await tx.userPortfolio.findMany({
    where:  { userId },
    select: { portfolioValue: true },
  });
  const totalMarketValue = portfolios.reduce((s, p) => s + (p.portfolioValue ?? 0), 0);
  await tx.masterWallet.updateMany({
    where: { userId },
    data:  { netAssetValue: totalMarketValue },
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
    const depositTarget     = (req.query.depositTarget as string) || "";
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
        depositTarget     ? { depositTarget: depositTarget as any } : {},
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
/*  CREATE DEPOSIT  POST /deposits                                       */
/*                                                                      */
/*  depositTarget = MASTER (default)                                    */
/*    External money coming into the system. Lands in master wallet.   */
/*    userPortfolioId is NOT required.                                  */
/*                                                                      */
/*  depositTarget = ALLOCATION                                           */
/*    Internal transfer: master wallet → portfolio wallet.             */
/*    userPortfolioId IS required.                                      */
/*    Master wallet balance is checked & reserved at approval.         */
/* ------------------------------------------------------------------ */
export async function createDeposit(req: Request, res: Response) {
  try {
    const {
      userId, userPortfolioId,
      amount, depositTarget,
      transactionId, mobileNo, referenceNo,
      accountNo, method, description,
      createdById, createdByName, createdByRole,
      proofUrl, proofFileName,
      bankCost, transactionCost, cashAtBank,
    } = req.body as Partial<{
      userId: string; userPortfolioId: string;
      amount: number | string; depositTarget: string;
      transactionId: string; mobileNo: string; referenceNo: string;
      accountNo: string; method: string; description: string;
      createdById: string; createdByName: string; createdByRole: string;
      proofUrl: string; proofFileName: string;
      bankCost: number | string; transactionCost: number | string; cashAtBank: number | string;
    }>;

    const target = (depositTarget === "ALLOCATION" ? "ALLOCATION" : "MASTER") as "MASTER" | "ALLOCATION";
    const amt    = num(amount, NaN);

    if (!userId || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({
        data: null,
        error: "userId and a positive amount are required",
      });
    }

    if (target === "ALLOCATION" && !userPortfolioId) {
      return res.status(400).json({
        data: null,
        error: "userPortfolioId is required for ALLOCATION deposits",
      });
    }

    // Verify user and master wallet exist
    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, masterWallet: { select: { id: true, balance: true } } },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    let portfolioWalletId: string | null = null;
    let masterWalletId: string | null    = user.masterWallet?.id ?? null;

    if (target === "ALLOCATION") {
      const up = await db.userPortfolio.findUnique({
        where:  { id: userPortfolioId! },
        select: { id: true, userId: true, wallet: { select: { id: true } } },
      });
      if (!up) return res.status(404).json({ data: null, error: "Portfolio not found" });
      if (up.userId !== userId) {
        return res.status(403).json({ data: null, error: "Portfolio does not belong to this user" });
      }
      portfolioWalletId = up.wallet?.id ?? null;

      const balance = user.masterWallet?.balance ?? 0;
      if (balance < amt) {
        return res.status(400).json({
          data: null,
          error: `Insufficient master wallet balance. Available: ${balance.toFixed(2)}`,
        });
      }
    }

    // Detect if this is the first MASTER deposit for this user
    let isFirstDeposit = false;
    if (target === "MASTER") {
      const priorDeposit = await db.deposit.findFirst({
        where: { userId, depositTarget: "MASTER" },
        select: { id: true },
      });
      isFirstDeposit = !priorDeposit;
    }

    // Ensure master wallet exists (creates one for legacy users who lack it)
    let masterWallet = await db.masterWallet.findUnique({
      where:  { userId },
      select: { id: true, accountNumber: true },
    });
    if (!masterWallet) {
      const acctNo = `GK${Date.now().toString().slice(-9)}`;
      masterWallet = await db.masterWallet.create({
        data: { userId, accountNumber: acctNo, balance: 0, totalDeposited: 0, totalWithdrawn: 0, totalFees: 0, netAssetValue: 0, status: "ACTIVE" },
        select: { id: true, accountNumber: true },
      });
      masterWalletId = masterWallet.id;
    }
    const autoRefNo = masterWallet.accountNumber
      ? `${masterWallet.accountNumber}-${Date.now()}`
      : referenceNo ?? `DEP-${Date.now()}`;

    // Parse fee fields (apply on every MASTER deposit, not just first)
    const fBankCost        = target === "MASTER" ? num(bankCost, 0) : 0;
    const fTransactionCost = target === "MASTER" ? num(transactionCost, 0) : 0;
    const fCashAtBank      = target === "MASTER" ? num(cashAtBank, 0) : 0;
    const fTotalFees       = fBankCost + fTransactionCost + fCashAtBank;

    const created = await db.deposit.create({
      data: {
        userId,
        userPortfolioId:   userPortfolioId  ?? null,
        portfolioWalletId: portfolioWalletId ?? null,
        masterWalletId:    masterWalletId    ?? null,
        depositTarget:     target,
        amount:            amt,
        transactionStatus: Status.PENDING,
        transactionId:     transactionId  ?? null,
        mobileNo:          mobileNo       ?? null,
        referenceNo:       autoRefNo,
        accountNo:         accountNo      ?? null,
        method:            method         ?? null,
        description:       description    ?? null,
        proofUrl:          proofUrl       ?? null,
        proofFileName:     proofFileName  ?? null,
        createdById:       createdById    ?? null,
        createdByName:     createdByName  ?? null,
        createdByRole:     (createdByRole as UserRole) ?? null,
        bankCost:          fBankCost,
        transactionCost:   fTransactionCost,
        cashAtBank:        fCashAtBank,
        totalFees:         fTotalFees,
        isFirstDeposit,
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
export async function updateDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });

    const {
      amount, transactionId, mobileNo, referenceNo,
      accountNo, method, description, createdAt,
    } = req.body as Partial<{
      amount: number | string; transactionId: string;
      mobileNo: string; referenceNo: string; accountNo: string;
      method: string; description: string; createdAt: string;
    }>;

    // Non-date fields require PENDING status
    const nonDateFields = [amount, transactionId, mobileNo, referenceNo, accountNo, method, description];
    const hasNonDate = nonDateFields.some((v) => v !== undefined);
    if (hasNonDate && existing.transactionStatus !== Status.PENDING) {
      return res.status(409).json({ data: null, error: "Only PENDING deposits can be updated" });
    }

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

    // Date update — allowed regardless of status (admin override)
    if (createdAt !== undefined) {
      const d = new Date(createdAt);
      if (isNaN(d.getTime())) return res.status(400).json({ data: null, error: "Invalid createdAt date" });
      data.createdAt = d;
    }

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
/*                                                                      */
/*  MASTER deposit:                                                     */
/*    → increment masterWallet.balance + totalDeposited                 */
/*                                                                      */
/*  ALLOCATION deposit:                                                  */
/*    → verify masterWallet.balance >= amount                           */
/*    → decrement masterWallet.balance                                  */
/*    → run applyTopup() (creates SubPortfolio, updates PortfolioWallet)*/
/* ------------------------------------------------------------------ */
export async function approveDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { approvedById, approvedByName, transactionId, assetPrices, approvedAt } =
      (req.body ?? {}) as {
        approvedById?: string;
        approvedByName?: string;
        transactionId?: string;
        /** assetId → { costPerShare, closePrice } provided by staff at allocation approval */
        assetPrices?: Record<string, { costPerShare: number; closePrice: number }> | null;
        approvedAt?: string;
      };

    const approvalDate = approvedAt ? new Date(approvedAt) : new Date();

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

    // For ALLOCATIONs, verify master wallet has enough balance
    if (existing.depositTarget === "ALLOCATION") {
      const mw = await db.masterWallet.findUnique({
        where:  { userId: existing.userId },
        select: { balance: true },
      });
      if (!mw || mw.balance < existing.amount) {
        return res.status(400).json({
          data:  null,
          error: `Insufficient master wallet balance. Available: ${(mw?.balance ?? 0).toFixed(2)}`,
        });
      }
      if (!existing.userPortfolioId) {
        return res.status(400).json({ data: null, error: "ALLOCATION deposit requires a userPortfolioId" });
      }
    }

    const approved = await db.$transaction(async (tx) => {
      if (existing.depositTarget === "MASTER") {
        // Fees were set at deposit creation — read them from the existing record
        const fTotalFees = Number(existing.totalFees ?? 0);
        const netAmount  = existing.amount - fTotalFees;

        const row = await tx.deposit.update({
          where: { id },
          data: {
            transactionStatus: Status.APPROVED,
            transactionId:     transactionId  ?? existing.transactionId ?? null,
            approvedById:      approvedById   ?? null,
            approvedByName:    approvedByName ?? null,
            approvedAt:        approvalDate,
          },
        });

        // Credit net amount (gross minus deductions) to master wallet cash balance.
        // Use upsert so that legacy users without a master wallet row get one created
        // automatically — updateMany would silently update 0 rows otherwise.
        await tx.masterWallet.upsert({
          where: { userId: existing.userId },
          create: {
            userId:         existing.userId,
            accountNumber:  `GK${Date.now().toString().slice(-9)}`,
            balance:        netAmount >= 0 ? netAmount : 0,
            totalDeposited: existing.amount,
            totalFees:      fTotalFees,
            netAssetValue:  0,
            status:         "ACTIVE",
          },
          update: {
            balance:        { increment: netAmount >= 0 ? netAmount : 0 },
            totalDeposited: { increment: existing.amount },
            totalFees:      { increment: fTotalFees },
          },
        });

        return row;
      } else {
        // ALLOCATION: master wallet balance → portfolio wallet (top-up)
        const row = await tx.deposit.update({
          where: { id },
          data: {
            transactionStatus: Status.APPROVED,
            transactionId:     transactionId  ?? existing.transactionId ?? null,
            approvedById:      approvedById   ?? null,
            approvedByName:    approvedByName ?? null,
            approvedAt:        approvalDate,
          },
        });

        // Deduct from master wallet cash balance
        await tx.masterWallet.updateMany({
          where: { userId: existing.userId },
          data:  { balance: { decrement: existing.amount } },
        });

        // Apply top-up: SubPortfolio snapshot + X2 merge + TopupEvent
        await applyTopup(tx, id, existing.userPortfolioId!, existing.amount, assetPrices ?? {});

        // Sync master wallet NAV = Σ portfolioValue (market value)
        await syncMasterWalletNav(tx, existing.userId);

        return row;
      }
    }, { timeout: 30000 });

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
/*                                                                      */
/*  Reverses an APPROVED deposit:                                       */
/*   MASTER     → decrement masterWallet.balance + totalDeposited       */
/*   ALLOCATION → refund master balance, decrement portfolioWallet      */
/* ------------------------------------------------------------------ */
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

      if (existing.depositTarget === "MASTER") {
        // Undo exactly what was credited/accumulated at approval time
        const fTotalFees = Number(existing.totalFees ?? 0);
        const netAmount  = existing.amount - fTotalFees;
        await tx.masterWallet.updateMany({
          where: { userId: existing.userId },
          data: {
            balance:        { decrement: netAmount >= 0 ? netAmount : 0 },
            totalDeposited: { decrement: existing.amount },
            totalFees:      { decrement: fTotalFees },
          },
        });
      } else {
        // ALLOCATION reversal: refund back to master wallet balance, deduct from portfolio wallet
        await tx.masterWallet.updateMany({
          where: { userId: existing.userId },
          data:  { balance: { increment: existing.amount } },
        });
        if (existing.portfolioWalletId) {
          await tx.portfolioWallet.update({
            where: { id: existing.portfolioWalletId },
            data: {
              balance:       { decrement: existing.amount },
              // netAssetValue is cost-basis NAV — decrement by the reversed amount
              netAssetValue: { decrement: existing.amount },
            },
          });
        }
        // Also roll back userPortfolio totals if the portfolio exists
        if (existing.userPortfolioId) {
          const up = await tx.userPortfolio.findUnique({
            where:  { id: existing.userPortfolioId },
            select: { totalInvested: true, portfolioValue: true },
          });
          if (up) {
            const newTotalInvested = Math.max(0, Number(up.totalInvested) - existing.amount);
            const newPortfolioValue = Math.max(0, Number(up.portfolioValue) - existing.amount);
            await tx.userPortfolio.update({
              where: { id: existing.userPortfolioId },
              data:  {
                totalInvested:  newTotalInvested,
                portfolioValue: newPortfolioValue,
                totalLossGain:  newPortfolioValue - newTotalInvested,
              },
            });
          }
        }
        await syncMasterWalletNav(tx, existing.userId);
      }

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

/* ------------------------------------------------------------------ */
/*  GET DEPOSIT FEE SUMMARY  GET /deposits/summary/:userId             */
/* ------------------------------------------------------------------ */
export async function getDepositFeeSummary(req: Request, res: Response) {
  try {
    const { userId } = req.params;

    const deposits = await db.deposit.findMany({
      where: {
        userId,
        transactionStatus: Status.APPROVED,
      },
      select: {
        amount: true,
        bankCost: true,
        transactionCost: true,
        cashAtBank: true,
        totalFees: true,
      },
    });

    const summary = deposits.reduce(
      (acc, deposit) => ({
        totalDeposited: acc.totalDeposited + (deposit.amount ?? 0),
        totalBankCost: acc.totalBankCost + (deposit.bankCost ?? 0),
        totalTransactionCost: acc.totalTransactionCost + (deposit.transactionCost ?? 0),
        totalCashAtBank: acc.totalCashAtBank + (deposit.cashAtBank ?? 0),
        totalFees: acc.totalFees + (deposit.totalFees ?? 0),
        depositCount: acc.depositCount + 1,
      }),
      {
        totalDeposited: 0,
        totalBankCost: 0,
        totalTransactionCost: 0,
        totalCashAtBank: 0,
        totalFees: 0,
        depositCount: 0,
      }
    );

    return res.status(200).json({ data: summary, error: null });
  } catch (error) {
    console.error("getDepositFeeSummary error:", error);
    return res.status(500).json({ data: null, error: "Failed to get deposit fee summary" });
  }
}
