// src/controllers/withdrawals.ts
import { Request, Response } from "express";
import { Prisma, UserRole } from "@prisma/client";
import { db } from "@/db/db";
import { regenerateReportForPortfolio } from "@/controllers/portfolio-performance-report";

/* --------------------------------- helpers --------------------------------- */

type TxStatus = "PENDING" | "APPROVED" | "REJECTED";

function asStatus(v: any): TxStatus | undefined {
  const s = String(v || "").toUpperCase();
  if (s === "PENDING" || s === "APPROVED" || s === "REJECTED") return s;
  return undefined;
}

function num(v: any, def = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : def;
}

function parseIncludeParam(raw?: string) {
  const inc = (raw || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const include: Prisma.WithdrawalInclude = {};
  if (inc.includes("user"))            include.user = true;
  if (inc.includes("portfoliowallet")) include.portfolioWallet = true;
  if (inc.includes("masterwallet"))    include.masterWallet = true;
  if (inc.includes("userportfolio"))   include.userPortfolio = true;
  if (inc.includes("createdby"))       include.createdBy = true;
  if (inc.includes("approvedby"))      include.approvedBy = true;
  if (inc.includes("rejectedby"))      include.rejectedBy = true;
  return include;
}

const SORTABLE_FIELDS = new Set<keyof Prisma.WithdrawalOrderByWithRelationInput>([
  "createdAt", "amount", "transactionStatus", "updatedAt",
]);

/* ---------------------------------- helpers -------------------------------- */

/**
 * Recalculate all live UserPortfolioAsset positions after portfolio wallet NAV changes.
 */
async function recomputePortfolioFromNav(
  tx: Prisma.TransactionClient,
  userPortfolioId: string,
  newNetAssetValue: number
) {
  const userPortfolio = await tx.userPortfolio.findUnique({
    where:   { id: userPortfolioId },
    include: { userAssets: { include: { asset: { select: { id: true, closePrice: true } } } } },
  });
  if (!userPortfolio) return;

  let totalPortfolioValue = 0;
  let totalCostPrice      = 0;

  for (const ua of userPortfolio.userAssets) {
    const costPrice  = (ua.allocationPercentage / 100) * newNetAssetValue;
    const stock      = ua.costPerShare > 0 ? costPrice / ua.costPerShare : 0;
    const closeValue = ua.asset.closePrice * stock;
    const lossGain   = closeValue - costPrice;

    await tx.userPortfolioAsset.update({
      where: { id: ua.id },
      data:  { costPrice, stock, closeValue, lossGain },
    });

    totalPortfolioValue += closeValue;
    totalCostPrice      += costPrice;
  }

  await tx.userPortfolio.update({
    where: { id: userPortfolioId },
    data: {
      portfolioValue: totalPortfolioValue,
      totalInvested:  totalCostPrice,
      totalLossGain:  totalPortfolioValue - totalCostPrice,
    },
  });
}

/**
 * Sync MasterWallet.netAssetValue by summing all PortfolioWallet NAVs.
 * Does NOT touch balance (cash available — managed separately).
 */
async function syncMasterWalletNav(tx: Prisma.TransactionClient, userId: string) {
  const wallets = await tx.portfolioWallet.findMany({
    where:  { userPortfolio: { userId } },
    select: { netAssetValue: true },
  });
  const totalNav = wallets.reduce((sum, w) => sum + w.netAssetValue, 0);
  await tx.masterWallet.updateMany({
    where: { userId },
    data:  { netAssetValue: totalNav },
  });
}

/* ---------------------------------- LIST ----------------------------------- */
/**
 * GET /withdrawals
 * Query: q?, userId?, userPortfolioId?, portfolioWalletId?, masterWalletId?,
 *        withdrawalType?, status?, page?, pageSize?, sortBy?, order?, include?
 */
export async function listWithdrawals(req: Request, res: Response) {
  try {
    const q                = (req.query.q as string) || "";
    const userId           = (req.query.userId as string) || "";
    const userPortfolioId  = (req.query.userPortfolioId as string) || "";
    const portfolioWalletId = (req.query.portfolioWalletId as string) || "";
    const masterWalletId   = (req.query.masterWalletId as string) || "";
    const withdrawalType   = (req.query.withdrawalType as string) || "";
    const status           = asStatus(req.query.status);
    const include          = parseIncludeParam(req.query.include as string | undefined);

    const page     = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const sortByRaw = (req.query.sortBy as string) || "createdAt";
    const sortBy   = SORTABLE_FIELDS.has(sortByRaw as any) ? (sortByRaw as any) : "createdAt";
    const order    = ((req.query.order as string) === "asc" ? "asc" : "desc") as "asc" | "desc";

    const where: Prisma.WithdrawalWhereInput = {
      AND: [
        userId            ? { userId }            : {},
        userPortfolioId   ? { userPortfolioId }   : {},
        portfolioWalletId ? { portfolioWalletId } : {},
        masterWalletId    ? { masterWalletId }    : {},
        withdrawalType    ? { withdrawalType: withdrawalType as any } : {},
        status            ? { transactionStatus: status } : {},
        q ? {
          OR: [
            { referenceNo:   { contains: q, mode: "insensitive" } },
            { method:        { contains: q, mode: "insensitive" } },
            { bankName:      { contains: q, mode: "insensitive" } },
            { accountNo:     { contains: q, mode: "insensitive" } },
            { accountName:   { contains: q, mode: "insensitive" } },
            { createdByName: { contains: q, mode: "insensitive" } },
          ],
        } : {},
      ],
    };

    const [total, items] = await db.$transaction([
      db.withdrawal.count({ where }),
      db.withdrawal.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
        include: Object.keys(include).length ? include : undefined,
      }),
    ]);

    return res.status(200).json({
      data: items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      error: null,
    });
  } catch (error) {
    console.error("listWithdrawals error:", error);
    return res.status(500).json({ data: null, error: "Failed to list withdrawals" });
  }
}

/* ----------------------------------- GET ----------------------------------- */
export async function getWithdrawalById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const include = parseIncludeParam(req.query.include as string | undefined);
    const row = await db.withdrawal.findUnique({
      where:   { id },
      include: Object.keys(include).length ? include : undefined,
    });
    if (!row) return res.status(404).json({ data: null, error: "Withdrawal not found" });
    return res.status(200).json({ data: row, error: null });
  } catch (error) {
    console.error("getWithdrawalById error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch withdrawal" });
  }
}

/* -------------------------------- CREATE ----------------------------------- */
/**
 * POST /withdrawals
 *
 * withdrawalType = HARD_WITHDRAWAL (default)
 *   Cash out to client's bank. Deducts from master wallet balance.
 *   userPortfolioId is NOT required (it's from the master wallet).
 *   Bank details (bankName, bankAccountName, bankBranch) ARE required.
 *
 * withdrawalType = REDEMPTION
 *   Internal: portfolio wallet → master wallet balance.
 *   userPortfolioId IS required.
 *   Bank details are NOT required.
 *   Requires admin approval with manual closing prices.
 */
export async function createWithdrawal(req: Request, res: Response) {
  try {
    const {
      userId,
      userPortfolioId,
      portfolioWalletId,
      masterWalletId,
      withdrawalType,
      amount,
      referenceNo,
      transactionId,
      method,
      accountNo,
      accountName,
      bankName,
      bankAccountName,
      bankBranch,
      description,
      createdById,
      createdByName,
      createdByRole,
    } = req.body as Partial<{
      userId: string;
      userPortfolioId: string;
      portfolioWalletId: string;
      masterWalletId: string;
      withdrawalType: string;
      amount: number | string;
      referenceNo: string;
      transactionId: string | null;
      method: string | null;
      accountNo: string | null;
      accountName: string | null;
      bankName: string;
      bankAccountName: string;
      bankBranch: string;
      description: string | null;
      createdById: string;
      createdByName: string;
      createdByRole: string;
    }>;

    const wType = (withdrawalType === "REDEMPTION" ? "REDEMPTION" : "HARD_WITHDRAWAL") as "HARD_WITHDRAWAL" | "REDEMPTION";
    const amt   = num(amount, NaN);

    if (!userId || !referenceNo || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({
        data: null,
        error: "userId, referenceNo and a positive amount are required",
      });
    }

    // Verify user + fetch master wallet
    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, masterWallet: { select: { id: true, balance: true } } },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    const resolvedMasterWalletId = masterWalletId ?? user.masterWallet?.id ?? null;

    let resolvedPortfolioWalletId: string | null = null;
    let resolvedUserPortfolioId: string | null   = userPortfolioId ?? null;

    if (wType === "HARD_WITHDRAWAL") {
      // Must have bank details; deducts from master wallet — requires admin approval
      if (!bankName || !bankAccountName || !bankBranch) {
        return res.status(400).json({
          data: null,
          error: "bankName, bankAccountName and bankBranch are required for HARD_WITHDRAWAL",
        });
      }

      const created = await db.withdrawal.create({
        data: {
          userId,
          userPortfolioId:   resolvedUserPortfolioId,
          portfolioWalletId: resolvedPortfolioWalletId,
          masterWalletId:    resolvedMasterWalletId,
          withdrawalType:    wType,
          amount:            amt,
          referenceNo,
          transactionId:     transactionId   ?? null,
          transactionStatus: "PENDING",
          method:            method          ?? null,
          accountNo:         accountNo       ?? null,
          accountName:       accountName     ?? null,
          bankName:          bankName        ?? "",
          bankAccountName:   bankAccountName ?? "",
          bankBranch:        bankBranch      ?? "",
          description:       description     ?? null,
          createdById:       createdById     ?? null,
          createdByName:     createdByName   ?? null,
          createdByRole:     (createdByRole as UserRole) ?? null,
        },
      });

      return res.status(201).json({ data: created, error: null });
    }

    // ── REDEMPTION: requires admin approval with manual closing prices ──────────
    if (!userPortfolioId) {
      return res.status(400).json({ data: null, error: "userPortfolioId is required for REDEMPTION" });
    }

    // Fetch portfolio to validate it exists and belongs to user
    const up = await db.userPortfolio.findUnique({
      where:   { id: userPortfolioId },
      include: {
        userAssets: { include: { asset: { select: { id: true, closePrice: true } } } },
        subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
        wallet: { select: { id: true, netAssetValue: true, balance: true } },
      },
    });
    if (!up) return res.status(404).json({ data: null, error: "Portfolio not found" });
    if (up.userId !== userId) {
      return res.status(403).json({ data: null, error: "Portfolio does not belong to this user" });
    }
    if (!up.wallet) {
      return res.status(400).json({ data: null, error: "Portfolio wallet not found" });
    }

    resolvedPortfolioWalletId = portfolioWalletId ?? up.wallet.id;

    // Available for withdrawal = sum of all asset close values (current market value)
    const totalCloseValue = up.userAssets.reduce((sum, ua) => sum + ua.closeValue, 0);
    if (totalCloseValue < amt) {
      return res.status(400).json({
        data: null,
        error: `Insufficient portfolio close value. Available: ${totalCloseValue.toFixed(2)}`,
      });
    }

    // Create redemption as PENDING - requires admin approval with manual closing prices
    const created = await db.withdrawal.create({
      data: {
        userId,
        userPortfolioId:   userPortfolioId,
        portfolioWalletId: resolvedPortfolioWalletId,
        masterWalletId:    resolvedMasterWalletId,
        withdrawalType:    wType,
        amount:            amt,
        referenceNo,
        transactionId:     transactionId  ?? null,
        transactionStatus: "PENDING",
        method:            method         ?? null,
        accountNo:         accountNo      ?? null,
        accountName:       accountName    ?? null,
        bankName:          "",
        bankAccountName:   "",
        bankBranch:        "",
        description:       description    ?? null,
        createdById:       createdById    ?? null,
        createdByName:     createdByName  ?? null,
        createdByRole:     (createdByRole as UserRole) ?? null,
      },
    });

    return res.status(201).json({ data: created, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("createWithdrawal error:", error);
    return res.status(500).json({ data: null, error: error?.message ?? "Failed to create withdrawal" });
  }
}

/* -------------------------------- UPDATE ----------------------------------- */
export async function updateWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const exists = await db.withdrawal.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ data: null, error: "Withdrawal not found" });
    if (exists.transactionStatus !== "PENDING") {
      return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be updated" });
    }

    const {
      amount, transactionId, method,
      accountNo, accountName,
      bankName, bankAccountName, bankBranch,
      description, transactionStatus,
    } = req.body as Partial<{
      amount: number | string;
      transactionId: string | null;
      method: string | null;
      accountNo: string | null;
      accountName: string | null;
      bankName: string;
      bankAccountName: string;
      bankBranch: string;
      description: string | null;
      transactionStatus: string;
    }>;

    if (transactionStatus && asStatus(transactionStatus) !== "PENDING") {
      return res.status(400).json({ data: null, error: "Use approve/reject endpoints to change status" });
    }

    const data: Prisma.WithdrawalUpdateInput = {};
    if (amount !== undefined) {
      const a = num(amount, NaN);
      if (!Number.isFinite(a) || a <= 0) {
        return res.status(400).json({ data: null, error: "amount must be > 0" });
      }
      data.amount = a;
    }
    if (transactionId   !== undefined) data.transactionId   = transactionId;
    if (method          !== undefined) data.method          = method;
    if (accountNo       !== undefined) data.accountNo       = accountNo;
    if (accountName     !== undefined) data.accountName     = accountName;
    if (bankName        !== undefined) data.bankName        = bankName;
    if (bankAccountName !== undefined) data.bankAccountName = bankAccountName;
    if (bankBranch      !== undefined) data.bankBranch      = bankBranch;
    if (description     !== undefined) data.description     = description;

    const updated = await db.withdrawal.update({ where: { id }, data });
    return res.status(200).json({ data: updated, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("updateWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to update withdrawal" });
  }
}

/* -------------------------------- APPROVE ---------------------------------- */
/**
 * POST /withdrawals/:id/approve
 *
 * HARD_WITHDRAWAL:
 *   → verify masterWallet.balance >= amount
 *   → decrement masterWallet.balance + increment totalWithdrawn
 *
 * REDEMPTION:
 *   → requires manual closing prices from admin
 *   → decrement portfolioWallet.balance + netAssetValue
 *   → increment masterWallet.balance (cash returned to master)
 *   → recompute portfolio asset positions
 *   → sync master NAV
 *   → date-based processing (uses approvedAt date for snapshot)
 */
export async function approveWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { 
      approvedById, 
      approvedByName, 
      transactionId,
      assetPrices,
      approvedAt
    } = (req.body ?? {}) as { 
      approvedById?: string; 
      approvedByName?: string; 
      transactionId?: string;
      assetPrices?: Record<string, number> | null;
      approvedAt?: string;
    };

    const existing = await db.withdrawal.findUnique({
      where:   { id },
      include: {
        portfolioWallet: { select: { id: true, netAssetValue: true, balance: true } },
        masterWallet:    { select: { id: true, balance: true } },
      },
    });
    if (!existing) return res.status(404).json({ data: null, error: "Withdrawal not found" });

    if (existing.transactionStatus === "APPROVED") {
      return res.status(200).json({ data: existing, error: null }); // idempotent
    }
    if (existing.transactionStatus === "REJECTED") {
      return res.status(409).json({ data: null, error: "Cannot approve a rejected withdrawal" });
    }

    // transactionId required only for hard withdrawals
    if (existing.withdrawalType === "HARD_WITHDRAWAL" && !transactionId?.trim()) {
      return res.status(400).json({ data: null, error: "transactionId is required for HARD_WITHDRAWAL approval" });
    }

    // For REDEMPTION: require manual closing prices from admin
    if (existing.withdrawalType === "REDEMPTION") {
      if (!existing.portfolioWallet) {
        return res.status(400).json({ data: null, error: "No portfolio wallet linked to this redemption" });
      }
      if (!existing.userPortfolioId) {
        return res.status(400).json({ data: null, error: "No portfolio linked to this redemption" });
      }
      if (!assetPrices || Object.keys(assetPrices).length === 0) {
        return res.status(400).json({ 
          data: null, 
          error: "assetPrices is required for REDEMPTION approval. Provide closing prices for each asset." 
        });
      }
    }

    if (existing.withdrawalType === "HARD_WITHDRAWAL") {
      const balance = existing.masterWallet?.balance ?? 0;
      if (balance < existing.amount) {
        return res.status(400).json({
          data: null,
          error: `Insufficient master wallet balance. Available: ${balance.toFixed(2)}`,
        });
      }
    }

    // For REDEMPTION: fetch live asset positions and validate manual closing prices
    let redemptionData: {
      userPortfolioWithAssets: Awaited<ReturnType<typeof db.userPortfolio.findUnique>> & {
        userAssets: Array<{
          id: string; assetId: string; allocationPercentage: number; costPerShare: number;
          costPrice: number; stock: number; closeValue: number; lossGain: number;
          asset: { id: string; closePrice: number };
        }>;
        subPortfolios: Array<{ generation: number }>;
        customName: string;
      };
      totalCloseValue: number;
      manualClosePriceByAsset: Map<string, number>;
    } | null = null;

    if (existing.withdrawalType === "REDEMPTION") {
      const up = await db.userPortfolio.findUnique({
        where:   { id: existing.userPortfolioId! },
        include: {
          userAssets:    { include: { asset: { select: { id: true, closePrice: true } } } },
          subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
        },
      });
      if (!up) return res.status(404).json({ data: null, error: "Portfolio not found" });

      // Build map of manual closing prices
      const manualClosePriceByAsset = new Map<string, number>();
      let totalCloseValue = 0;
      
      for (const ua of up.userAssets) {
        const manualPrice = assetPrices?.[ua.assetId];
        if (manualPrice === undefined || manualPrice <= 0) {
          return res.status(400).json({
            data: null,
            error: `Invalid or missing closing price for asset ${ua.assetId}. Admin must provide all asset prices.`,
          });
        }
        manualClosePriceByAsset.set(ua.assetId, manualPrice);
        // Calculate close value using manual price instead of current market price
        totalCloseValue += ua.stock * manualPrice;
        
        // Update the asset's close price in the database
        await db.asset.update({
          where: { id: ua.assetId },
          data: { closePrice: manualPrice },
        });
      }

      if (totalCloseValue < existing.amount) {
        return res.status(400).json({
          data: null,
          error: `Insufficient portfolio close value at provided prices. Available: ${totalCloseValue.toFixed(2)}`,
        });
      }

      redemptionData = { userPortfolioWithAssets: up as any, totalCloseValue, manualClosePriceByAsset };
    }

    // Parse approval date (date-based processing)
    const approvalDate = approvedAt ? new Date(approvedAt) : new Date();

    const approved = await db.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id },
        data: {
          transactionStatus: "APPROVED",
          transactionId:     transactionId?.trim() ?? null,
          approvedById:      approvedById  ?? null,
          approvedByName:    approvedByName ?? null,
          approvedAt:        approvalDate,
        },
      });

      if (existing.withdrawalType === "HARD_WITHDRAWAL") {
        // Deduct from master wallet cash balance
        await tx.masterWallet.updateMany({
          where: { userId: existing.userId },
          data: {
            balance:        { decrement: existing.amount },
            totalWithdrawn: { increment: existing.amount },
          },
        });
      } else {
        // REDEMPTION: portfolio wallet → master wallet balance
        // Uses manual closing prices provided by admin
        const { userPortfolioWithAssets: up, totalCloseValue, manualClosePriceByAsset } = redemptionData!;
        const newNAV         = totalCloseValue - existing.amount;
        const totalCostPrice  = up.userAssets.reduce((sum: number, ua: any) => sum + ua.costPrice, 0);
        const nextGeneration  = (up.subPortfolios[0]?.generation ?? 0) + 1;

        // Snapshot the current portfolio state as a redemption sub-portfolio (for audit trail)
        const redemptionSub = await tx.subPortfolio.create({
          data: {
            userPortfolioId: existing.userPortfolioId!,
            generation:      nextGeneration,
            label:           `${up.customName} - Redemption`,
            amountInvested:  0,
            totalCostPrice,
            totalCloseValue,
            totalLossGain:   totalCloseValue - totalCostPrice,
            bankFee:         0,
            transactionFee:  0,
            feeAtBank:       0,
            totalFees:       0,
            cashAtBank:      0,
            snapshotDate:    approvalDate,
          },
        });

        if (up.userAssets.length > 0) {
          await tx.subPortfolioAsset.createMany({
            data: up.userAssets.map((ua: any) => ({
              subPortfolioId:       redemptionSub.id,
              assetId:              ua.assetId,
              allocationPercentage: ua.allocationPercentage,
              costPerShare:         ua.costPerShare,
              costPrice:            ua.costPrice,
              stock:                ua.stock,
              closePrice:           manualClosePriceByAsset.get(ua.assetId) ?? ua.asset.closePrice,
              closeValue:           ua.stock * (manualClosePriceByAsset.get(ua.assetId) ?? ua.asset.closePrice),
              lossGain:             (ua.stock * (manualClosePriceByAsset.get(ua.assetId) ?? ua.asset.closePrice)) - ua.costPrice,
            })),
            skipDuplicates: true,
          });
        }

        // Update portfolio wallet: funds leave, NAV set to remaining close value
        await tx.portfolioWallet.update({
          where: { id: existing.portfolioWallet!.id },
          data: {
            balance:       { decrement: existing.amount },
            netAssetValue: newNAV,
          },
        });

        // Return redeemed funds to master wallet cash balance
        await tx.masterWallet.updateMany({
          where: { userId: existing.userId },
          data:  { balance: { increment: existing.amount } },
        });

        // Recompute all asset positions using remaining close value as new NAV
        if (existing.userPortfolioId) {
          await recomputePortfolioFromNav(tx, existing.userPortfolioId, newNAV);
        }

        // Sync master NAV from all portfolio wallets
        await syncMasterWalletNav(tx, existing.userId);
      }

      return updatedWithdrawal;
    }, { timeout: 30000, maxWait: 35000 });

    // Respond immediately, then refresh the performance report in the background
    res.status(200).json({ data: approved, error: null });

    // REDEMPTION: regenerate today's report so the reports page reflects the new portfolio state
    if (existing.withdrawalType === "REDEMPTION" && existing.userPortfolioId) {
      regenerateReportForPortfolio(existing.userPortfolioId).catch((err) =>
        console.error(`[regenerateReport] approveWithdrawal REDEMPTION failed for ${existing.userPortfolioId}:`, err)
      );
    }
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("approveWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to approve withdrawal" });
  }
}

/* -------------------------------- REJECT ----------------------------------- */
export async function rejectWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { rejectedById, rejectedByName, reason } =
      (req.body ?? {}) as { rejectedById?: string; rejectedByName?: string; reason?: string };

    const row = await db.withdrawal.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ data: null, error: "Withdrawal not found" });
    if (row.transactionStatus !== "PENDING") {
      return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be rejected" });
    }

    const updated = await db.withdrawal.update({
      where: { id },
      data: {
        transactionStatus: "REJECTED",
        rejectedById:      rejectedById   ?? null,
        rejectedByName:    rejectedByName ?? null,
        rejectedAt:        new Date(),
        rejectReason:      reason         ?? null,
      },
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (error) {
    console.error("rejectWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to reject withdrawal" });
  }
}

/* -------------------------------- DELETE ----------------------------------- */
export async function deleteWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const exists = await db.withdrawal.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ data: null, error: "Withdrawal not found" });
    if (exists.transactionStatus !== "PENDING") {
      return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be deleted" });
    }

    await db.withdrawal.delete({ where: { id } });
    return res.status(200).json({ data: null, error: null, message: "Withdrawal deleted" });
  } catch (error) {
    console.error("deleteWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to delete withdrawal" });
  }
}
