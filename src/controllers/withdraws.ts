// src/controllers/withdrawals.ts
import { Request, Response } from "express";
import { Prisma, UserRole } from "@prisma/client";
import { db } from "@/db/db";

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
  if (inc.includes("user"))             include.user = true;
  if (inc.includes("portfoliowallet"))  include.portfolioWallet = true;
  if (inc.includes("masterwallet"))     include.masterWallet = true;
  if (inc.includes("userportfolio"))    include.userPortfolio = true;
  if (inc.includes("createdby"))        include.createdBy = true;
  if (inc.includes("approvedby"))       include.approvedBy = true;
  if (inc.includes("rejectedby"))       include.rejectedBy = true;
  return include;
}

const SORTABLE_FIELDS = new Set<keyof Prisma.WithdrawalOrderByWithRelationInput>([
  "createdAt",
  "amount",
  "transactionStatus",
  "updatedAt",
]);

/* ---------------------------------- LIST ----------------------------------- */
/**
 * GET /withdrawals
 * Query:
 *  - q?             search referenceNo, method, bankName, accountNo/accountName
 *  - userId?        filter by client
 *  - userPortfolioId? filter by portfolio
 *  - portfolioWalletId?
 *  - masterWalletId?
 *  - status?        PENDING | APPROVED | REJECTED
 *  - page?, pageSize?, sortBy?, order?
 *  - include?       "user,portfolioWallet,masterWallet,userPortfolio,createdBy,approvedBy,rejectedBy"
 */
export async function listWithdrawals(req: Request, res: Response) {
  try {
    const q                = (req.query.q as string) || "";
    const userId           = (req.query.userId as string) || "";
    const userPortfolioId  = (req.query.userPortfolioId as string) || "";
    const portfolioWalletId = (req.query.portfolioWalletId as string) || "";
    const masterWalletId   = (req.query.masterWalletId as string) || "";
    const status           = asStatus(req.query.status);
    const include          = parseIncludeParam(req.query.include as string | undefined);

    const page     = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const sortByRaw = (req.query.sortBy as string) || "createdAt";
    const sortBy   = SORTABLE_FIELDS.has(sortByRaw as any) ? (sortByRaw as any) : "createdAt";
    const order    = ((req.query.order as string) === "asc" ? "asc" : "desc") as "asc" | "desc";

    const where: Prisma.WithdrawalWhereInput = {
      AND: [
        userId           ? { userId }           : {},
        userPortfolioId  ? { userPortfolioId }  : {},
        portfolioWalletId ? { portfolioWalletId } : {},
        masterWalletId   ? { masterWalletId }   : {},
        status           ? { transactionStatus: status } : {},
        q
          ? {
              OR: [
                { referenceNo:     { contains: q, mode: "insensitive" } },
                { method:          { contains: q, mode: "insensitive" } },
                { bankName:        { contains: q, mode: "insensitive" } },
                { accountNo:       { contains: q, mode: "insensitive" } },
                { accountName:     { contains: q, mode: "insensitive" } },
                { createdByName:   { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const [total, items] = await db.$transaction([
      db.withdrawal.count({ where }),
      db.withdrawal.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
/** GET /withdrawals/:id */
export async function getWithdrawalById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const include = parseIncludeParam(req.query.include as string | undefined);

    const row = await db.withdrawal.findUnique({
      where: { id },
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
 * Created by an admin/agent on behalf of a client.
 * Body: {
 *   userId, userPortfolioId, portfolioWalletId?,  masterWalletId?,
 *   amount, referenceNo, bankName, bankAccountName, bankBranch,
 *   createdById, createdByName, createdByRole,
 *   transactionId?, method?, accountNo?, accountName?, description?
 * }
 * Starts as PENDING — no balance deduction yet.
 */
export async function createWithdrawal(req: Request, res: Response) {
  try {
    const {
      userId,
      userPortfolioId,
      portfolioWalletId,
      masterWalletId,
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
      amount: number | string;
      referenceNo: string;
      transactionId?: string | null;
      method?: string | null;
      accountNo?: string | null;
      accountName?: string | null;
      bankName: string;
      bankAccountName: string;
      bankBranch: string;
      description?: string | null;
      createdById?: string;
      createdByName?: string;
      createdByRole?: string;
    }>;

    const amt = num(amount, NaN);

    if (
      !userId || !userPortfolioId || !referenceNo ||
      !bankName || !bankAccountName || !bankBranch ||
      !Number.isFinite(amt) || amt <= 0
    ) {
      return res.status(400).json({
        data: null,
        error: "userId, userPortfolioId, referenceNo, bankName, bankAccountName, bankBranch and a positive amount are required",
      });
    }

    // Verify client and portfolio exist, and the portfolio belongs to this user
    const [user, userPortfolio] = await db.$transaction([
      db.user.findUnique({ where: { id: userId }, select: { id: true } }),
      db.userPortfolio.findUnique({
        where: { id: userPortfolioId },
        select: { id: true, userId: true, wallet: { select: { id: true, netAssetValue: true } } },
      }),
    ]);

    if (!user)          return res.status(404).json({ data: null, error: "User not found" });
    if (!userPortfolio) return res.status(404).json({ data: null, error: "Portfolio not found" });
    if (userPortfolio.userId !== userId) {
      return res.status(403).json({ data: null, error: "Portfolio does not belong to this user" });
    }

    // Resolve portfolio wallet — prefer explicit param, fall back to the portfolio's own wallet
    const resolvedPortfolioWalletId = portfolioWalletId ?? userPortfolio.wallet?.id ?? null;

    const created = await db.withdrawal.create({
      data: {
        userId,
        userPortfolioId,
        portfolioWalletId: resolvedPortfolioWalletId,
        masterWalletId:    masterWalletId ?? null,
        amount:            amt,
        referenceNo,
        transactionId:     transactionId ?? null,
        transactionStatus: "PENDING",
        method:            method ?? null,
        accountNo:         accountNo ?? null,
        accountName:       accountName ?? null,
        bankName,
        bankAccountName,
        bankBranch,
        description:       description ?? null,
        createdById:       createdById   ?? null,
        createdByName:     createdByName ?? null,
        createdByRole:     (createdByRole as UserRole) ?? null,
      },
    });

    return res.status(201).json({ data: created, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("createWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to create withdrawal" });
  }
}

/* -------------------------------- UPDATE ----------------------------------- */
/** PATCH /withdrawals/:id — only while PENDING */
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
      transactionId?: string | null;
      method?: string | null;
      accountNo?: string | null;
      accountName?: string | null;
      bankName?: string;
      bankAccountName?: string;
      bankBranch?: string;
      description?: string | null;
      transactionStatus?: string;
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
    if (transactionId  !== undefined) data.transactionId  = transactionId;
    if (method         !== undefined) data.method         = method;
    if (accountNo      !== undefined) data.accountNo      = accountNo;
    if (accountName    !== undefined) data.accountName    = accountName;
    if (bankName       !== undefined) data.bankName       = bankName;
    if (bankAccountName !== undefined) data.bankAccountName = bankAccountName;
    if (bankBranch     !== undefined) data.bankBranch     = bankBranch;
    if (description    !== undefined) data.description    = description;

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
 * Recalculate all live UserPortfolioAsset positions for a given portfolio
 * after its wallet NAV changes (deposit or withdrawal).
 * Uses the USER-SPECIFIC allocationPercentage and costPerShare stored on each asset.
 */
async function recomputePortfolioFromNav(
  tx: Prisma.TransactionClient,
  userPortfolioId: string,
  newNetAssetValue: number
) {
  const userPortfolio = await tx.userPortfolio.findUnique({
    where: { id: userPortfolioId },
    include: {
      userAssets: {
        include: {
          asset: { select: { id: true, closePrice: true } },
        },
      },
    },
  });

  if (!userPortfolio) return;

  let totalPortfolioValue = 0;
  let totalCostPrice      = 0;

  for (const userAsset of userPortfolio.userAssets) {
    const costPrice  = (userAsset.allocationPercentage / 100) * newNetAssetValue;
    const stock      = userAsset.costPerShare > 0 ? costPrice / userAsset.costPerShare : 0;
    const closeValue = userAsset.asset.closePrice * stock;
    const lossGain   = closeValue - costPrice;

    await tx.userPortfolioAsset.update({
      where: { id: userAsset.id },
      data: { costPrice, stock, closeValue, lossGain },
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
 * Sync MasterWallet totals by summing all PortfolioWallet NAVs for this user.
 */
async function syncMasterWallet(tx: Prisma.TransactionClient, userId: string) {
  const wallets = await tx.portfolioWallet.findMany({
    where: { userPortfolio: { userId } },
    select: { netAssetValue: true },
  });

  const totalNav = wallets.reduce((sum, w) => sum + w.netAssetValue, 0);

  await tx.masterWallet.updateMany({
    where: { userId },
    data: { netAssetValue: totalNav },
  });
}

/**
 * POST /withdrawals/:id/approve
 * Body: { approvedById, approvedByName, transactionId }
 * PENDING → APPROVED
 * Deducts from PortfolioWallet, recalculates assets, syncs MasterWallet.
 */
export async function approveWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { approvedById, approvedByName, transactionId } =
      (req.body ?? {}) as { approvedById?: string; approvedByName?: string; transactionId?: string };

    if (!transactionId?.trim()) {
      return res.status(400).json({ data: null, error: "transactionId is required to approve" });
    }

    const existing = await db.withdrawal.findUnique({
      where: { id },
      include: { portfolioWallet: { select: { id: true, netAssetValue: true } } },
    });
    if (!existing) return res.status(404).json({ data: null, error: "Withdrawal not found" });

    if (existing.transactionStatus === "APPROVED") {
      return res.status(200).json({ data: existing, error: null }); // idempotent
    }
    if (existing.transactionStatus === "REJECTED") {
      return res.status(409).json({ data: null, error: "Cannot approve a rejected withdrawal" });
    }
    if (!existing.portfolioWallet) {
      return res.status(400).json({ data: null, error: "No portfolio wallet linked to this withdrawal" });
    }
    if (existing.portfolioWallet.netAssetValue < existing.amount) {
      return res.status(400).json({ data: null, error: "Insufficient portfolio wallet balance" });
    }

    const approved = await db.$transaction(async (tx) => {
      // 1. Mark approved
      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id },
        data: {
          transactionStatus: "APPROVED",
          transactionId:     transactionId.trim(),
          approvedById:      approvedById  ?? null,
          approvedByName:    approvedByName ?? null,
          approvedAt:        new Date(),
        },
      });

      // 2. Deduct from PortfolioWallet
      const updatedWallet = await tx.portfolioWallet.update({
        where: { id: existing.portfolioWallet!.id },
        data: {
          balance:       { decrement: existing.amount },
          netAssetValue: { decrement: existing.amount },
          totalFees:     existing.portfolioWallet!.netAssetValue - existing.amount < 0 ? 0 : undefined,
        },
        select: { netAssetValue: true },
      });

      // 3. Deduct from MasterWallet totals
      await tx.masterWallet.updateMany({
        where: { userId: existing.userId },
        data: {
          totalWithdrawn: { increment: existing.amount },
          netAssetValue:  { decrement: existing.amount },
        },
      });

      // 4. Recalculate asset positions from new NAV
      if (existing.userPortfolioId) {
        await recomputePortfolioFromNav(tx, existing.userPortfolioId, updatedWallet.netAssetValue);
      }

      // 5. Sync master wallet NAV from all portfolio wallets
      await syncMasterWallet(tx, existing.userId);

      return updatedWithdrawal;
    });

    return res.status(200).json({ data: approved, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("approveWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to approve withdrawal" });
  }
}

/* -------------------------------- REJECT ----------------------------------- */
/**
 * POST /withdrawals/:id/reject
 * Body: { rejectedById, rejectedByName, reason }
 * PENDING → REJECTED — no balance changes.
 */
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
/** DELETE /withdrawals/:id — only while PENDING */
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