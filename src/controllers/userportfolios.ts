// src/controllers/user-portfolio.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { Prisma } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type Tx = Prisma.TransactionClient | typeof db;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function toNumber(v: unknown, fallback = 0): number {
  const n =
    typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseInclude(q: any): Prisma.UserPortfolioInclude | undefined {
  const raw = ((q.include as string | undefined) ?? "").toLowerCase();
  const set = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));

  const includeUser =
    set.has("user") || set.has("member") ||
    q.includeUser === "1" || q.includeUser === "true";
  const includePortfolio =
    set.has("portfolio") ||
    q.includePortfolio === "1" || q.includePortfolio === "true";
  const includeUserAssets =
    set.has("userassets") || set.has("assets") ||
    q.includeUserAssets === "1" || q.includeUserAssets === "true";
  const includeSubPortfolios =
    set.has("subportfolios") || set.has("subs") ||
    q.includeSubPortfolios === "1" || q.includeSubPortfolios === "true";
  const includeWallet =
    set.has("wallet") ||
    q.includeWallet === "1" || q.includeWallet === "true";

  const include: Prisma.UserPortfolioInclude = {};

  if (includeUser) {
    include.user = {
      select: {
        id: true, firstName: true, lastName: true, name: true,
        email: true, phone: true, role: true, status: true,
        masterWallet: {
          select: {
            id: true, accountNumber: true,
            netAssetValue: true, totalDeposited: true,
            totalWithdrawn: true, totalFees: true, status: true,
          },
        },
      },
    };
  }
  if (includePortfolio) {
    include.portfolio = {
      include: { assets: { include: { asset: true } } },
    };
  }
  if (includeUserAssets) {
    include.userAssets = { include: { asset: true } };
  }
  if (includeSubPortfolios) {
    include.subPortfolios = {
      orderBy: { generation: "asc" },
      include: { assets: { include: { asset: true } } },
    };
  }
  if (includeWallet) {
    include.wallet = true;
  }

  return Object.keys(include).length ? include : undefined;
}

/** Default rich include used in most GET responses */
const DEFAULT_INCLUDE: Prisma.UserPortfolioInclude = {
  user: {
    select: {
      id: true, firstName: true, lastName: true, name: true,
      email: true, phone: true,
      masterWallet: {
        select: {
          id: true, accountNumber: true,
          balance: true, netAssetValue: true, status: true,
        },
      },
    },
  },
  portfolio:     { include: { assets: { include: { asset: true } } } },
  userAssets:    { include: { asset: true } },
  wallet:        true,
  subPortfolios: {
    orderBy: { generation: "asc" },
    include: { assets: { include: { asset: true } } },
  },
};

/** Compute derived fields for a single UserPortfolioAsset */
function computeUPA(
  nav: number,
  userAllocPercent: number,
  userCostPerShare: number,
  currentClosePrice: number
) {
  const costPrice  = (userAllocPercent / 100) * nav;
  const stock      = userCostPerShare > 0 ? costPrice / userCostPerShare : 0;
  const closeValue = currentClosePrice * stock;
  const lossGain   = closeValue - costPrice;
  return { costPrice, stock, closeValue, lossGain };
}

/**
 * Recompute all UserPortfolioAssets for a given UserPortfolio.
 * Uses the portfolio's OWN PortfolioWallet.netAssetValue (not master wallet).
 */
async function recomputeUPAsFor(userPortfolioId: string, client: Tx = db) {
  const up = await client.userPortfolio.findUnique({
    where: { id: userPortfolioId },
    include: {
      wallet:     true, // PortfolioWallet
      userAssets: { include: { asset: { select: { id: true, closePrice: true } } } },
    },
  });

  if (!up)         throw new Error("UserPortfolio not found.");
  if (!up.wallet)  throw new Error("Portfolio wallet not found.");

  const nav = toNumber(up.wallet.netAssetValue, 0);

  let totalPortfolioValue = 0;
  let totalCostPrice      = 0;

  for (const ua of up.userAssets) {
    const { costPrice, stock, closeValue, lossGain } = computeUPA(
      nav,
      toNumber(ua.allocationPercentage, 0),
      toNumber(ua.costPerShare, 0),
      toNumber(ua.asset?.closePrice, 0)
    );

    await client.userPortfolioAsset.update({
      where: { id: ua.id },
      data:  { costPrice, stock, closeValue, lossGain },
    });

    totalPortfolioValue += closeValue;
    totalCostPrice      += costPrice;
  }

  // totalInvested = NAV + totalFees (NAV is stored on the wallet)
  const totalInvested = nav + toNumber(up.wallet.totalFees, 0);

  await client.userPortfolio.update({
    where: { id: up.id },
    data: {
      portfolioValue: totalPortfolioValue,
      totalInvested,
      totalLossGain:  totalPortfolioValue - totalInvested,
    },
  });

  // NAV is fixed (totalInvested − totalFees) — do not overwrite with market value

  return { count: up.userAssets.length, totalPortfolioValue };
}

/**
 * Sync MasterWallet by summing all PortfolioWallet NAVs for the user.
 */
async function syncMasterWallet(client: Tx, userId: string) {
  const wallets = await client.portfolioWallet.findMany({
    where:  { userPortfolio: { userId } },
    select: { netAssetValue: true },
  });

  const totalNav = wallets.reduce((sum, w) => sum + toNumber(w.netAssetValue, 0), 0);

  await client.masterWallet.updateMany({
    where: { userId },
    data:  { netAssetValue: totalNav },
  });
}

/* ------------------------------------------------------------------ */
/*  CREATE  POST /user-portfolios                                       */
/* ------------------------------------------------------------------ */
/**
 * Enroll a user into a portfolio template with a custom name.
 * Creates:
 *  - UserPortfolio (with customName)
 *  - PortfolioWallet (dedicated wallet for this enrollment)
 *  - SubPortfolio generation=0 (the initial "X" slice)
 *  - SubPortfolioAssets (snapshot of initial allocation)
 *  - UserPortfolioAssets (live merged positions)
 *
 * Body: {
 *   userId, portfolioId, customName,
 *   amountInvested,          ← the deposit amount going into this portfolio
 *   assetAllocations: [{ assetId, allocationPercentage, costPerShare }]
 * }
 */
export async function createUserPortfolio(req: Request, res: Response) {
  try {
    const {
      userId, portfolioId, customName,
      amountInvested,
      bankFee: bankFeeInput,
      transactionFee: transactionFeeInput,
      feeAtBank: feeAtBankInput,
      assetAllocations,
    } = req.body as {
        userId?: string;
        portfolioId?: string;
        customName?: string;
        amountInvested?: number | string;
        bankFee?: number | string;
        transactionFee?: number | string;
        feeAtBank?: number | string;
        assetAllocations?: Array<{
          assetId: string;
          allocationPercentage: number;
          costPerShare: number;
        }>;
      };

    if (!userId || !portfolioId || !customName?.trim()) {
      return res.status(400).json({
        data: null,
        error: "userId, portfolioId and customName are required.",
      });
    }
    if (!assetAllocations?.length) {
      return res.status(400).json({
        data: null,
        error: "assetAllocations array is required with at least one asset.",
      });
    }

    // amountInvested is optional — portfolio can be created with 0 and funded later via ALLOCATION
    const investedAmt = toNumber(amountInvested, 0);

    // Fee rates: now 0 - fees are deducted from master wallet, not during allocation
    const bankFee        = 0;
    const transactionFee = 0;
    const feeAtBank      = 0;
    const totalFees      = 0;

    // Validate each allocation entry
    for (const a of assetAllocations) {
      if (!a.assetId) {
        return res.status(400).json({ data: null, error: "Each allocation must have an assetId." });
      }
      if (typeof a.allocationPercentage !== "number" || a.allocationPercentage < 0) {
        return res.status(400).json({ data: null, error: "allocationPercentage must be >= 0." });
      }
      if (typeof a.costPerShare !== "number" || a.costPerShare < 0) {
        return res.status(400).json({ data: null, error: "costPerShare must be >= 0." });
      }
    }

    // Existence checks
    const [user, portfolio] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { id: true, masterWallet: { select: { id: true, balance: true } } } }),
      db.portfolio.findUnique({ where: { id: portfolioId } }),
    ]);

    if (!user)      return res.status(404).json({ data: null, error: "User not found." });
    if (!user.masterWallet) {
      return res.status(400).json({ data: null, error: "User master wallet not found." });
    }
    if (!portfolio) return res.status(404).json({ data: null, error: "Portfolio not found." });

    // Check sufficient master wallet balance
    if (investedAmt > 0) {
      const balance = user.masterWallet.balance ?? 0;
      if (balance < investedAmt) {
        return res.status(400).json({
          data: null,
          error: `Insufficient master wallet balance. Available: $${balance.toFixed(2)}, Required: $${investedAmt.toFixed(2)}`,
        });
      }
    }

    // Check name uniqueness for this user+portfolio combination
    const nameConflict = await db.userPortfolio.findFirst({
      where: { userId, portfolioId, customName: customName.trim() },
      select: { id: true },
    });
    if (nameConflict) {
      return res.status(409).json({
        data: null,
        error: `You already have a portfolio named "${customName.trim()}" for this fund.`,
      });
    }

    // Fetch current close prices for all assets
    const assetIds = assetAllocations.map((a) => a.assetId);
    const assets   = await db.asset.findMany({
      where:  { id: { in: assetIds } },
      select: { id: true, closePrice: true },
    });
    const assetMap = new Map(assets.map((a) => [a.id, a]));

    for (const a of assetAllocations) {
      if (!assetMap.has(a.assetId)) {
        return res.status(404).json({ data: null, error: `Asset ${a.assetId} not found.` });
      }
    }

    // NAV = totalInvested (fees are now deducted from master wallet, not during allocation)
    const navAmt     = investedAmt;

    const rows = assetAllocations.map((a) => {
      const closePrice = toNumber(assetMap.get(a.assetId)!.closePrice, 0);
      const { costPrice, stock, closeValue, lossGain } = computeUPA(
        navAmt,
        a.allocationPercentage,
        a.costPerShare,
        closePrice
      );
      return { ...a, costPrice, stock, closeValue, lossGain, closePrice };
    });

    const totalCloseValue = rows.reduce((s, r) => s + r.closeValue, 0);
    const cashAtBank      = investedAmt - rows.reduce((s, r) => s + r.costPrice, 0);

    const upId = await db.$transaction(async (tx) => {
      // 1. Create UserPortfolio
      const up = await tx.userPortfolio.create({
        data: {
          userId,
          portfolioId,
          customName:     customName.trim(),
          portfolioValue: totalCloseValue,
          totalInvested:  investedAmt,
          totalLossGain:  totalCloseValue - investedAmt,
        },
      });

      // 2. Create dedicated PortfolioWallet (no fees - deducted from master wallet)
      const accountNumber = `GKP${Date.now().toString().slice(-7)}`;
      await tx.portfolioWallet.create({
        data: {
          accountNumber,
          userPortfolioId: up.id,
          balance:         investedAmt,
          bankFee:         0,
          transactionFee:  0,
          feeAtBank:       0,
          totalFees:       0,
          netAssetValue:   navAmt,
          status:          "ACTIVE",
        },
      });

      // 3. Create SubPortfolio generation=0 (the initial "X" slice)
      const sub = await tx.subPortfolio.create({
        data: {
          userPortfolioId: up.id,
          generation:      0,
          label:           `${customName.trim()} - Initial`,
          amountInvested:  investedAmt,
          totalCostPrice:  rows.reduce((s, r) => s + r.costPrice, 0),
          totalCloseValue,
          totalLossGain:   totalCloseValue - investedAmt,
          bankFee:         0,
          transactionFee:  0,
          feeAtBank:       0,
          totalFees:       0,
          cashAtBank,
          snapshotDate:    new Date(),
        },
      });

      // 4. Create SubPortfolioAssets (snapshot)
      await tx.subPortfolioAsset.createMany({
        data: rows.map((r) => ({
          subPortfolioId:       sub.id,
          assetId:              r.assetId,
          allocationPercentage: r.allocationPercentage,
          costPerShare:         r.costPerShare,
          costPrice:            r.costPrice,
          stock:                r.stock,
          closePrice:           r.closePrice,
          closeValue:           r.closeValue,
          lossGain:             r.lossGain,
        })),
        skipDuplicates: true,
      });

      // 5. Create live UserPortfolioAssets (X2 state — same as X at creation)
      await tx.userPortfolioAsset.createMany({
        data: rows.map((r) => ({
          userPortfolioId:      up.id,
          assetId:              r.assetId,
          allocationPercentage: r.allocationPercentage,
          costPerShare:         r.costPerShare,
          costPrice:            r.costPrice,
          stock:                r.stock,
          closeValue:           r.closeValue,
          lossGain:             r.lossGain,
        })),
        skipDuplicates: true,
      });

      // 6. Deduct from MasterWallet balance and update NAV
      if (investedAmt > 0) {
        await tx.masterWallet.update({
          where: { userId },
          data:  {
            balance:       { decrement: investedAmt },
            netAssetValue: { increment: totalCloseValue },
          },
        });
      }

      return up.id;
    }, { timeout: 20_000, maxWait: 5_000 });

    const result = await db.userPortfolio.findUnique({
      where:   { id: upId },
      include: DEFAULT_INCLUDE,
    });

    return res.status(201).json({ data: result, error: null });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Portfolio name already taken for this user and fund." });
    }
    console.error("createUserPortfolio error:", err);
    return res.status(500).json({
      data:  null,
      error: err?.code === "P2028"
        ? "Operation timed out. Please try again."
        : "Failed to create user-portfolio.",
    });
  }
}

/* ------------------------------------------------------------------ */
/*  LIST  GET /user-portfolios                                          */
/* ------------------------------------------------------------------ */
export async function listUserPortfolios(req: Request, res: Response) {
  try {
    const { userId, portfolioId, isActive } = req.query as {
      userId?: string; portfolioId?: string; isActive?: string;
    };

    const where: Prisma.UserPortfolioWhereInput = {
      ...(userId      ? { userId }      : {}),
      ...(portfolioId ? { portfolioId } : {}),
      ...(isActive !== undefined ? { isActive: isActive === "true" } : {}),
    };

    const items = await db.userPortfolio.findMany({
      where:   Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: "desc" },
      include: parseInclude(req.query) ?? DEFAULT_INCLUDE,
    });

    return res.status(200).json({ data: items, error: null });
  } catch (err) {
    console.error("listUserPortfolios error:", err);
    return res.status(500).json({ data: null, error: "Failed to load user-portfolios." });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY ID  GET /user-portfolios/:id                                 */
/* ------------------------------------------------------------------ */
export async function getUserPortfolioById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const include = parseInclude(req.query) ?? DEFAULT_INCLUDE;

    let portfolio = await db.userPortfolio.findUnique({ where: { id }, include });

    // Fallback: treat id as a portfolioId (template)
    if (!portfolio) {
      portfolio = await db.userPortfolio.findFirst({
        where: { portfolioId: id },
        include,
      });
    }

    if (!portfolio) {
      return res.status(404).json({ data: null, error: "Portfolio not found." });
    }

    return res.status(200).json({ data: portfolio, error: null });
  } catch (err) {
    console.error("getUserPortfolioById error:", err);
    return res.status(500).json({ data: null, error: "Failed to load user portfolio." });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE  PATCH /user-portfolios/:id                                  */
/* ------------------------------------------------------------------ */
/**
 * Supports:
 *  - customName        rename the enrollment
 *  - assetAllocations  upsert individual asset positions + recompute totals
 *  - recompute=true    re-derive all positions from current wallet NAV
 *  - isActive          activate / deactivate
 */
export async function updateUserPortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const { customName, recompute, assetAllocations, isActive } = req.body as Partial<{
      customName: string;
      recompute: boolean;
      isActive: boolean;
      assetAllocations: Array<{
        assetId: string;
        allocationPercentage: number;
        costPerShare: number;
      }>;
    }>;

    const current = await db.userPortfolio.findUnique({
      where:   { id },
      include: { wallet: true },
    });
    if (!current) return res.status(404).json({ data: null, error: "UserPortfolio not found." });

    const updated = await db.$transaction(async (tx) => {
      // Rename
      if (customName?.trim() && customName.trim() !== current.customName) {
        const conflict = await tx.userPortfolio.findFirst({
          where: { userId: current.userId, portfolioId: current.portfolioId, customName: customName.trim(), NOT: { id } },
          select: { id: true },
        });
        if (conflict) throw new Error("DUPLICATE_CUSTOM_NAME");

        await tx.userPortfolio.update({ where: { id }, data: { customName: customName.trim() } });
      }

      // Toggle active
      if (isActive !== undefined) {
        await tx.userPortfolio.update({ where: { id }, data: { isActive } });
      }

      // Upsert individual asset allocations
      if (assetAllocations?.length) {
        const nav = toNumber(current.wallet?.netAssetValue, 0);

        const assetIds = assetAllocations.map((a) => a.assetId);
        const assets   = await tx.asset.findMany({
          where:  { id: { in: assetIds } },
          select: { id: true, closePrice: true },
        });
        const assetMap = new Map(assets.map((a) => [a.id, a]));

        for (const a of assetAllocations) {
          const asset = assetMap.get(a.assetId);
          if (!asset) continue;

          const { costPrice, stock, closeValue, lossGain } = computeUPA(
            nav,
            a.allocationPercentage,
            a.costPerShare,
            toNumber(asset.closePrice, 0)
          );

          await tx.userPortfolioAsset.upsert({
            where:  { userPortfolioId_assetId: { userPortfolioId: id, assetId: a.assetId } },
            update: { allocationPercentage: a.allocationPercentage, costPerShare: a.costPerShare, costPrice, stock, closeValue, lossGain },
            create: { userPortfolioId: id, assetId: a.assetId, allocationPercentage: a.allocationPercentage, costPerShare: a.costPerShare, costPrice, stock, closeValue, lossGain },
          });
        }

        // Recompute portfolio totals
        const allAssets = await tx.userPortfolioAsset.findMany({
          where:  { userPortfolioId: id },
          select: { closeValue: true, costPrice: true },
        });
        const totalClose = allAssets.reduce((s, a) => s + toNumber(a.closeValue, 0), 0);
        const totalCost  = allAssets.reduce((s, a) => s + toNumber(a.costPrice, 0), 0);

        // totalCost = Σ(alloc% × NAV) = NAV; totalInvested = NAV + totalFees
        const walletTotalFees = toNumber(current.wallet?.totalFees, 0);
        const totalInvested   = totalCost + walletTotalFees;

        await tx.userPortfolio.update({
          where: { id },
          data:  { portfolioValue: totalClose, totalInvested, totalLossGain: totalClose - totalInvested },
        });
        // NAV is fixed (totalInvested − totalFees) — do not overwrite with market value
      }

      // Full recompute from current wallet NAV
      if (recompute) {
        await recomputeUPAsFor(id, tx);
      }

      // Sync master wallet
      await syncMasterWallet(tx, current.userId);

      return tx.userPortfolio.findUnique({
        where:   { id },
        include: parseInclude(req.query) ?? DEFAULT_INCLUDE,
      });
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (err: any) {
    if (err?.message === "DUPLICATE_CUSTOM_NAME") {
      return res.status(409).json({ data: null, error: "You already have a portfolio with that name for this fund." });
    }
    if (err?.code === "P2025") {
      return res.status(404).json({ data: null, error: "UserPortfolio not found." });
    }
    if (err?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate portfolio name." });
    }
    console.error("updateUserPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to update user-portfolio." });
  }
}

/* ------------------------------------------------------------------ */
/*  RECOMPUTE  POST /user-portfolios/:id/recompute                      */
/* ------------------------------------------------------------------ */
export async function recomputeUserPortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const exists = await db.userPortfolio.findUnique({
      where:  { id },
      select: { id: true, userId: true },
    });
    if (!exists) return res.status(404).json({ data: null, error: "UserPortfolio not found." });

    const result = await db.$transaction(async (tx) => {
      const r = await recomputeUPAsFor(id, tx);
      await syncMasterWallet(tx, exists.userId);
      const fresh = await tx.userPortfolio.findUnique({
        where:   { id },
        include: parseInclude(req.query) ?? DEFAULT_INCLUDE,
      });
      return { r, fresh };
    });

    return res.status(200).json({
      data:  { recompute: result.r, userPortfolio: result.fresh },
      error: null,
    });
  } catch (err) {
    console.error("recomputeUserPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to recompute user-portfolio." });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE  DELETE /user-portfolios/:id                                 */
/* ------------------------------------------------------------------ */
export async function deleteUserPortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const up = await db.userPortfolio.findUnique({
      where:  { id },
      select: { id: true, userId: true },
    });
    if (!up) return res.status(404).json({ data: null, error: "UserPortfolio not found." });

    await db.$transaction(async (tx) => {
      // Cascade order: assets → sub-portfolio assets → sub-portfolios → wallet → portfolio
      // (Prisma onDelete: Cascade handles most, but explicit ordering avoids FK issues)
      await tx.userPortfolioAsset.deleteMany({ where: { userPortfolioId: id } });
      await tx.userPortfolio.delete({ where: { id } });
      // Sync master wallet after removal
      await syncMasterWallet(tx, up.userId);
    });

    return res.status(200).json({ data: null, error: null, message: "UserPortfolio deleted." });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ data: null, error: "UserPortfolio not found." });
    }
    console.error("deleteUserPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to delete user-portfolio." });
  }
}