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

/**
 * Sync MasterWallet.netAssetValue = Σ userPortfolio.portfolioValue (market value).
 * portfolioWallet.netAssetValue is the cost-basis NAV — do NOT sum that here.
 */
async function syncMasterWalletNav(tx: Prisma.TransactionClient, userId: string) {
  const portfolios = await tx.userPortfolio.findMany({
    where:  { userId },
    select: { portfolioValue: true },
  });
  const totalMarketValue = portfolios.reduce((s, p) => s + Number(p.portfolioValue ?? 0), 0);
  await tx.masterWallet.updateMany({
    where: { userId },
    data:  { netAssetValue: totalMarketValue },
  });
}

/* ---------------------------------- LIST ----------------------------------- */
export async function listWithdrawals(req: Request, res: Response) {
  try {
    const q                 = (req.query.q as string) || "";
    const userId            = (req.query.userId as string) || "";
    const userPortfolioId   = (req.query.userPortfolioId as string) || "";
    const portfolioWalletId = (req.query.portfolioWalletId as string) || "";
    const masterWalletId    = (req.query.masterWalletId as string) || "";
    const withdrawalType    = (req.query.withdrawalType as string) || "";
    const status            = asStatus(req.query.status);
    const include           = parseIncludeParam(req.query.include as string | undefined);

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
 *   userPortfolioId is NOT required.
 *   Bank details (bankName, bankAccountName, bankBranch) ARE required.
 *
 * withdrawalType = REDEMPTION
 *   Internal: portfolio → master wallet cash balance.
 *   userPortfolioId IS required.
 *   Bank details are NOT required.
 *   Can only redeem an amount ≤ the portfolio's current portfolioValue (market value).
 *   Admin provides per-asset closing prices at approval time to calculate stocks sold.
 */
export async function createWithdrawal(req: Request, res: Response) {
  try {
    const {
      userId, userPortfolioId, portfolioWalletId, masterWalletId,
      withdrawalType, amount, referenceNo, transactionId, method,
      accountNo, accountName, bankName, bankAccountName, bankBranch,
      description, createdById, createdByName, createdByRole,
    } = req.body as Partial<{
      userId: string; userPortfolioId: string; portfolioWalletId: string;
      masterWalletId: string; withdrawalType: string; amount: number | string;
      referenceNo: string; transactionId: string | null; method: string | null;
      accountNo: string | null; accountName: string | null;
      bankName: string; bankAccountName: string; bankBranch: string;
      description: string | null; createdById: string;
      createdByName: string; createdByRole: string;
    }>;

    const wType = (withdrawalType === "REDEMPTION" ? "REDEMPTION" : "HARD_WITHDRAWAL") as "HARD_WITHDRAWAL" | "REDEMPTION";
    const amt   = num(amount, NaN);

    if (!userId || !referenceNo || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({
        data: null,
        error: "userId, referenceNo and a positive amount are required",
      });
    }

    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, masterWallet: { select: { id: true, balance: true } } },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    const resolvedMasterWalletId = masterWalletId ?? user.masterWallet?.id ?? null;

    // ── HARD_WITHDRAWAL ────────────────────────────────────────────────────────
    if (wType === "HARD_WITHDRAWAL") {
      if (!bankName || !bankAccountName || !bankBranch) {
        return res.status(400).json({
          data: null,
          error: "bankName, bankAccountName and bankBranch are required for HARD_WITHDRAWAL",
        });
      }

      const created = await db.withdrawal.create({
        data: {
          userId,
          userPortfolioId:   null,
          portfolioWalletId: null,
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

    // ── REDEMPTION ─────────────────────────────────────────────────────────────
    if (!userPortfolioId) {
      return res.status(400).json({ data: null, error: "userPortfolioId is required for REDEMPTION" });
    }

    const up = await db.userPortfolio.findUnique({
      where:  { id: userPortfolioId },
      select: {
        id: true, userId: true,
        portfolioValue: true,          // current market value = max redeemable
        wallet: { select: { id: true } },
      },
    });
    if (!up) return res.status(404).json({ data: null, error: "Portfolio not found" });
    if (up.userId !== userId) {
      return res.status(403).json({ data: null, error: "Portfolio does not belong to this user" });
    }
    if (!up.wallet) {
      return res.status(400).json({ data: null, error: "Portfolio wallet not found" });
    }

    // User can only redeem up to the current market value of the portfolio
    const maxRedeemable = Number(up.portfolioValue ?? 0);
    if (amt > maxRedeemable) {
      return res.status(400).json({
        data:  null,
        error: `Redemption amount exceeds portfolio value. Max redeemable: ${maxRedeemable.toFixed(2)}`,
      });
    }

    const created = await db.withdrawal.create({
      data: {
        userId,
        userPortfolioId:   userPortfolioId,
        portfolioWalletId: portfolioWalletId ?? up.wallet.id,
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
      amount, transactionId, method, accountNo, accountName,
      bankName, bankAccountName, bankBranch, description, createdAt,
    } = req.body as Partial<{
      amount: number | string; transactionId: string | null; method: string | null;
      accountNo: string | null; accountName: string | null;
      bankName: string; bankAccountName: string; bankBranch: string;
      description: string | null; createdAt: string;
    }>;

    // Non-date fields require PENDING status
    const nonDateFields = [amount, transactionId, method, accountNo, accountName, bankName, bankAccountName, bankBranch, description];
    const hasNonDate = nonDateFields.some((v) => v !== undefined);
    if (hasNonDate && exists.transactionStatus !== "PENDING") {
      return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be updated" });
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

    // Date update — allowed regardless of status (admin override)
    if (createdAt !== undefined) {
      const d = new Date(createdAt);
      if (isNaN(d.getTime())) return res.status(400).json({ data: null, error: "Invalid createdAt date" });
      data.createdAt = d;
    }

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
 *   → decrement masterWallet.balance, increment totalWithdrawn
 *
 * REDEMPTION:
 *   Admin provides assetPrices: { [assetId]: closePrice } at approval time.
 *   The close price is ONLY used to calculate how many stocks are being sold.
 *   It does NOT update the system asset.closePrice.
 *
 *   Per asset:
 *     allocAmount = alloc% × redemptionAmount
 *     stocksSold  = allocAmount / adminClosePrice
 *
 *   Snapshot (X1 — sold portion, for audit):
 *     stock      = stocksSold
 *     costPrice  = allocAmount
 *     closePrice = adminClosePrice  (selling price, for this record only)
 *     closeValue = adminClosePrice × stocksSold
 *     lossGain   = closeValue − costPrice
 *
 *   New portfolio (X2 — remaining position):
 *     stock         = oldStock − stocksSold
 *     totalInvested = oldTotalInvested − redemptionAmount
 *     costPrice     = alloc% × newTotalInvested
 *     costPerShare  = newCostPrice / newStock
 *     closeValue    = asset.closePrice × newStock   ← system price, never the approval price
 *     lossGain      = closeValue − costPrice
 *
 *   Portfolio wallet:
 *     balance       -= redemptionAmount
 *     netAssetValue -= redemptionAmount  (cost-basis NAV reduces proportionally)
 *
 *   Master wallet:
 *     balance        += redemptionAmount
 *     totalWithdrawn += redemptionAmount
 *     netAssetValue   = Σ portfolioValue (re-synced)
 */
export async function approveWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { approvedById, approvedByName, transactionId, assetPrices, approvedAt } =
      (req.body ?? {}) as {
        approvedById?: string;
        approvedByName?: string;
        transactionId?: string;
        /** assetId → close price used ONLY to calculate stocks sold. Does NOT update system price. */
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

    if (existing.withdrawalType === "HARD_WITHDRAWAL") {
      if (!transactionId?.trim()) {
        return res.status(400).json({ data: null, error: "transactionId is required for HARD_WITHDRAWAL approval" });
      }
      const balance = existing.masterWallet?.balance ?? 0;
      if (balance < existing.amount) {
        return res.status(400).json({
          data:  null,
          error: `Insufficient master wallet balance. Available: ${balance.toFixed(2)}`,
        });
      }
    }

    // ── REDEMPTION pre-flight ──────────────────────────────────────────────────
    let redemptionContext: {
      up: {
        id: string; customName: string; totalInvested: number;
        userAssets: Array<{
          id: string; assetId: string; allocationPercentage: number;
          stock: number; costPrice: number; costPerShare: number;
          closeValue: number; lossGain: number;
          asset: { id: string; closePrice: number };
        }>;
        subPortfolios: Array<{ generation: number }>;
        wallet: { id: string; netAssetValue: number; balance: number } | null;
      };
    } | null = null;

    if (existing.withdrawalType === "REDEMPTION") {
      if (!existing.portfolioWallet) {
        return res.status(400).json({ data: null, error: "No portfolio wallet linked to this redemption" });
      }
      if (!existing.userPortfolioId) {
        return res.status(400).json({ data: null, error: "No portfolio linked to this redemption" });
      }
      if (!assetPrices || Object.keys(assetPrices).length === 0) {
        return res.status(400).json({
          data:  null,
          error: "assetPrices is required for REDEMPTION approval. Provide the selling close price for each asset.",
        });
      }

      const up = await db.userPortfolio.findUnique({
        where:   { id: existing.userPortfolioId },
        include: {
          userAssets:    { include: { asset: { select: { id: true, closePrice: true } } } },
          subPortfolios: { orderBy: { generation: "desc" }, take: 1, select: { generation: true } },
          wallet:        { select: { id: true, netAssetValue: true, balance: true } },
        },
      });
      if (!up) return res.status(404).json({ data: null, error: "Portfolio not found" });

      // Validate that every asset in the portfolio has a price supplied
      for (const ua of up.userAssets) {
        if (assetPrices[ua.assetId] === undefined || assetPrices[ua.assetId] <= 0) {
          return res.status(400).json({
            data:  null,
            error: `Missing or invalid close price for asset ${ua.assetId}`,
          });
        }
      }

      // Validate redemption amount does not exceed current portfolio market value
      const currentPortfolioValue = up.userAssets.reduce((s, ua) => s + Number(ua.closeValue), 0);
      if (existing.amount > currentPortfolioValue) {
        return res.status(400).json({
          data:  null,
          error: `Redemption amount ${existing.amount.toFixed(2)} exceeds portfolio value ${currentPortfolioValue.toFixed(2)}`,
        });
      }

      redemptionContext = { up: up as any };
    }

    const approvalDate = approvedAt ? new Date(approvedAt) : new Date();

    const approved = await db.$transaction(async (tx) => {
      const row = await tx.withdrawal.update({
        where: { id },
        data: {
          transactionStatus: "APPROVED",
          transactionId:     transactionId?.trim() ?? null,
          approvedById:      approvedById   ?? null,
          approvedByName:    approvedByName ?? null,
          approvedAt:        approvalDate,
        },
      });

      if (existing.withdrawalType === "HARD_WITHDRAWAL") {
        await tx.masterWallet.updateMany({
          where: { userId: existing.userId },
          data: {
            balance:        { decrement: existing.amount },
            totalWithdrawn: { increment: existing.amount },
          },
        });
        return row;
      }

      // ── REDEMPTION ─────────────────────────────────────────────────────────
      const { up } = redemptionContext!;
      const redemptionAmount = existing.amount;
      const nextGeneration   = (up.subPortfolios[0]?.generation ?? 0) + 1;
      const newTotalInvested = Math.max(0, Number(up.totalInvested) - redemptionAmount);

      // Per-asset: compute sold stocks and new portfolio position
      const assetResults = up.userAssets.map((ua) => {
        const adminClosePrice = assetPrices![ua.assetId]; // selling price — stock calc only
        const allocAmount     = (ua.allocationPercentage / 100) * redemptionAmount;
        const stocksSold      = adminClosePrice > 0 ? allocAmount / adminClosePrice : 0;

        // ── X1 snapshot (sold portion) ──
        const snapCloseValue = adminClosePrice * stocksSold;
        const snapLossGain   = snapCloseValue - allocAmount;

        // ── X2 remaining portfolio — use SYSTEM close price, never the approval price ──
        const newStock      = Math.max(0, Number(ua.stock) - stocksSold);
        const newCostPrice  = (ua.allocationPercentage / 100) * newTotalInvested;
        const newCostPerShare = newStock > 0 ? newCostPrice / newStock : 0;
        const newCloseValue = Number(ua.asset.closePrice) * newStock;
        const newLossGain   = newCloseValue - newCostPrice;

        return {
          id:                   ua.id,
          assetId:              ua.assetId,
          allocationPercentage: ua.allocationPercentage,
          snap: {
            stock:        stocksSold,
            costPrice:    allocAmount,
            closePrice:   adminClosePrice,
            closeValue:   snapCloseValue,
            lossGain:     snapLossGain,
          },
          x2: {
            stock:        newStock,
            costPrice:    newCostPrice,
            costPerShare: newCostPerShare,
            closeValue:   newCloseValue,
            lossGain:     newLossGain,
          },
        };
      });

      // ── 1. Create sub-portfolio snapshot (X1 — the sold portion) ───────────
      const snapTotalCostPrice  = assetResults.reduce((s, r) => s + r.snap.costPrice,  0);
      const snapTotalCloseValue = assetResults.reduce((s, r) => s + r.snap.closeValue, 0);

      const redemptionSub = await tx.subPortfolio.create({
        data: {
          userPortfolioId: existing.userPortfolioId!,
          generation:      nextGeneration,
          label:           `${up.customName} - Redemption ${nextGeneration}`,
          amountInvested:  redemptionAmount,
          totalCostPrice:  snapTotalCostPrice,
          totalCloseValue: snapTotalCloseValue,
          totalLossGain:   snapTotalCloseValue - snapTotalCostPrice,
          bankFee:         0,
          transactionFee:  0,
          feeAtBank:       0,
          totalFees:       0,
          cashAtBank:      0,
          snapshotDate:    approvalDate,
        },
      });

      await tx.subPortfolioAsset.createMany({
        data: assetResults.map((r) => ({
          subPortfolioId:       redemptionSub.id,
          assetId:              r.assetId,
          allocationPercentage: r.allocationPercentage,
          costPerShare:         r.snap.closePrice,   // selling price per share
          costPrice:            r.snap.costPrice,
          stock:                r.snap.stock,
          closePrice:           r.snap.closePrice,
          closeValue:           r.snap.closeValue,
          lossGain:             r.snap.lossGain,
        })),
        skipDuplicates: true,
      });

      // ── 2. Update each UserPortfolioAsset with remaining position (X2) ─────
      for (const r of assetResults) {
        await tx.userPortfolioAsset.update({
          where: { id: r.id },
          data: {
            stock:        r.x2.stock,
            costPrice:    r.x2.costPrice,
            costPerShare: r.x2.costPerShare,
            closeValue:   r.x2.closeValue,
            lossGain:     r.x2.lossGain,
          },
        });
      }

      // ── 3. Update UserPortfolio totals ─────────────────────────────────────
      const newPortfolioValue = assetResults.reduce((s, r) => s + r.x2.closeValue, 0);
      const newTotalLossGain  = newPortfolioValue - newTotalInvested;

      await tx.userPortfolio.update({
        where: { id: existing.userPortfolioId! },
        data: {
          totalInvested:  newTotalInvested,
          portfolioValue: newPortfolioValue,
          totalLossGain:  newTotalLossGain,
        },
      });

      // ── 4. Portfolio wallet: balance and cost-basis NAV both reduce ─────────
      await tx.portfolioWallet.update({
        where: { id: existing.portfolioWallet!.id },
        data: {
          balance:       { decrement: redemptionAmount },
          netAssetValue: { decrement: redemptionAmount },
        },
      });

      // ── 5. Master wallet: receive the redeemed cash, sync NAV ──────────────
      await tx.masterWallet.updateMany({
        where: { userId: existing.userId },
        data: {
          balance:        { increment: redemptionAmount },
          totalWithdrawn: { increment: redemptionAmount },
        },
      });
      await syncMasterWalletNav(tx, existing.userId);

      return row;
    }, { timeout: 30000, maxWait: 35000 });

    res.status(200).json({ data: approved, error: null });

    // Regenerate performance report in the background
    if (existing.withdrawalType === "REDEMPTION" && existing.userPortfolioId) {
      regenerateReportForPortfolio(existing.userPortfolioId).catch((err) =>
        console.error(`[regenerateReport] REDEMPTION failed for ${existing.userPortfolioId}:`, err)
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
