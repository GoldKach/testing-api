

// src/controllers/user-portfolio.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { Prisma } from "@prisma/client";

/* ----------------- shared types ----------------- */

// Accept either a Prisma transaction client (inside $transaction)
// or your exported db instance (which may be an Omit<PrismaClient,...>).
type Tx = Prisma.TransactionClient | typeof db;

/* ----------------- helpers ----------------- */

function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseInclude(q: any): Prisma.UserPortfolioInclude | undefined {
  // supports: ?include=user,portfolio,userAssets OR booleans ?includeUser=1&includePortfolio=1&includeUserAssets=1
  const includeParam = (q.include as string | undefined)?.toLowerCase() ?? "";
  const set = new Set(includeParam.split(",").map((s) => s.trim()).filter(Boolean));

  const includeUser =
    set.has("user") || set.has("member") || q.includeUser === "1" || q.includeUser === "true";
  const includePortfolio =
    set.has("portfolio") || q.includePortfolio === "1" || q.includePortfolio === "true";
  const includeUserAssets =
    set.has("userassets") || set.has("assets") || q.includeUserAssets === "1" || q.includeUserAssets === "true";

  const include: Prisma.UserPortfolioInclude = {};
  if (includeUser) {
    include.user = { include: { wallet: true } };
  }
  if (includePortfolio) {
    include.portfolio = {
      include: {
        assets: { include: { asset: true } }, // PortfolioAsset -> Asset
      },
    };
  }
  if (includeUserAssets) {
    include.userAssets = {
      include: {
        portfolioAsset: { include: { asset: true, portfolio: true } },
      },
    };
  }

  return Object.keys(include).length ? include : undefined;
}

/** pick allocation percent from PortfolioAsset->Asset or common fallbacks */
function pickAllocPercent(pa: any): number {
  return toNumber(
    pa?.asset?.allocPercent ??
      pa?.asset?.allocationPercentage ??
      pa?.allocPercent ??
      pa?.allocationPercentage,
    0
  );
}

/** compute UPA values from NAV + asset fields */
function computeUPA(nav: number, allocPercent: number, costPerShare: number, closePrice: number) {
  const costPrice = (allocPercent / 100) * nav;
  const stock = costPerShare > 0 ? costPrice / costPerShare : 0;
  const closeValue = closePrice * stock;
  const lossGain = closeValue - costPrice;
  return { costPrice, stock, closeValue, lossGain };
}

/** Recompute all UserPortfolioAssets for a given UserPortfolio and update portfolioValue */
async function recomputeUPAsFor(userPortfolioId: string, client: Tx = db) {
  const up = await client.userPortfolio.findUnique({
    where: { id: userPortfolioId },
    include: {
      user: { include: { wallet: true } },
      portfolio: { include: { assets: { include: { asset: true } } } },
    },
  });

  if (!up) throw new Error("UserPortfolio not found.");
  if (!up.user?.wallet) throw new Error("User wallet not found.");

  const nav = toNumber(up.user.wallet.netAssetValue, 0);

  let totalCostPrice = 0;
  let count = 0;

  for (const pa of up.portfolio.assets) {
    const alloc = pickAllocPercent(pa);
    const cps = toNumber(pa.asset?.costPerShare, 0);
    const close = toNumber(pa.asset?.closePrice, 0);

    const { costPrice, stock, closeValue, lossGain } = computeUPA(nav, alloc, cps, close);

    await client.userPortfolioAsset.upsert({
      where: {
        userPortfolioId_portfolioAssetId: {
          userPortfolioId: up.id,
          portfolioAssetId: pa.id,
        },
      },
      update: { costPrice, stock, closeValue, lossGain },
      create: {
        userPortfolioId: up.id,
        portfolioAssetId: pa.id,
        costPrice,
        stock,
        closeValue,
        lossGain,
      },
    });

    totalCostPrice += costPrice;
    count += 1;
  }

  await client.userPortfolio.update({
    where: { id: up.id },
    data: { portfolioValue: totalCostPrice },
  });

  return { count, totalCostPrice };
}

/* --------------------------------------------
   CREATE  (POST /user-portfolios)
--------------------------------------------- */
// export async function createUserPortfolio(req: Request, res: Response) {
//   try {
//     const { userId, portfolioId } = req.body as { userId?: string; portfolioId?: string };

//     if (!userId || !portfolioId) {
//       return res.status(400).json({ data: null, error: "userId and portfolioId are required." });
//     }

//     // Ensure user & wallet, and portfolio exist
//     const [user, portfolio] = await Promise.all([
//       db.user.findUnique({ where: { id: userId }, include: { wallet: true } }),
//       db.portfolio.findUnique({
//         where: { id: portfolioId },
//         include: { assets: { include: { asset: true } } },
//       }),
//     ]);

//     if (!user) return res.status(404).json({ data: null, error: "User not found." });
//     if (!user.wallet) return res.status(400).json({ data: null, error: "User wallet not found." });
//     if (!portfolio) return res.status(404).json({ data: null, error: "Portfolio not found." });

//     const created = await db.$transaction(async (tx) => {
//       const up = await tx.userPortfolio.create({
//         data: { userId, portfolioId, portfolioValue: 0 },
//       });

//       await recomputeUPAsFor(up.id, tx);

//       const withInclude = await tx.userPortfolio.findUnique({
//         where: { id: up.id },
//         include: parseInclude(req.query),
//       });

//       return withInclude;
//     });

//     return res.status(201).json({ data: created, error: null });
//   } catch (err: any) {
//     if (err?.code === "P2002") {
//       // @@unique([userId, portfolioId])
//       return res.status(409).json({ data: null, error: "User already has this portfolio." });
//     }
//     console.error("createUserPortfolio error:", err);
//     return res.status(500).json({ data: null, error: "Failed to create user-portfolio." });
//   }
// }


function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * POST /user-portfolios
 * Body: { userId: string; portfolioId: string }
 *
 * Steps:
 * 1) Get user (with wallet) -> walletValue
 * 2) Get portfolio (with assets -> asset)
 * 3) Create UserPortfolio
 * 4) Create UserPortfolioAsset entries for each portfolio asset
 * 5) Update portfolioValue (sum of costPrice)
 * 6) Return created UserPortfolio with userAssets included
 */






// export async function createUserPortfolio(req: Request, res: Response) {
//   try {
//     const { userId, portfolioId } = req.body as { userId?: string; portfolioId?: string };

//     if (!userId || !portfolioId) {
//       return res.status(400).json({ data: null, error: "userId and portfolioId are required." });
//     }

//     // Step 1: Get user's wallet
//     const user = await db.user.findUnique({
//       where: { id: userId },
//       include: { wallet: true },
//     });
//     if (!user || !user.wallet) {
//       return res.status(400).json({ data: null, error: "User or wallet not found" });
//     }
//     const walletValue = toNum(user.wallet.netAssetValue, 0);

//     // Step 2: Get the portfolio and its assets (with Asset details)
//     const portfolio = await db.portfolio.findUnique({
//       where: { id: portfolioId },
//       include: {
//         assets: {
//           include: { asset: true },
//         },
//       },
//     });
//     if (!portfolio) {
//       return res.status(404).json({ data: null, error: "Portfolio not found" });
//     }

//     // Run everything atomically
//     const created = await db.$transaction(async (tx) => {
//       // Step 3: Create the UserPortfolio
//       const up = await tx.userPortfolio.create({
//         data: {
//           userId,
//           portfolioId,
//           // portfolioValue stays 0.0 for now; we'll compute below then update
//         },
//       });

//       // Step 4: Create UserPortfolioAsset entries
//       let totalCostPrice = 0;
//       if (portfolio.assets.length > 0) {
//         // Build data first, then create many for efficiency
//         const upaRows = portfolio.assets.map((pa) => {
//           const allocationPercentage = toNum(pa.asset?.allocationPercentage, 0);
//           const costPerShare = toNum(pa.asset?.costPerShare, 0);
//           const closePrice = toNum(pa.asset?.closePrice, 0);

//           const costPrice = (allocationPercentage / 100) * walletValue;
//           const stock = costPerShare > 0 ? costPrice / costPerShare : 0;
//           const closeValue = stock * closePrice;
//           const lossGain = closeValue - costPrice;

//           totalCostPrice += costPrice;

//           return {
//             userPortfolioId: up.id,
//             portfolioAssetId: pa.id,
//             costPrice,
//             stock,
//             closeValue,
//             lossGain,
//           };
//         });

//         if (upaRows.length > 0) {
//           await tx.userPortfolioAsset.createMany({ data: upaRows });
//         }
//       }

//       // Step 5: Update portfolioValue (sum of costPrice we just computed)
//       await tx.userPortfolio.update({
//         where: { id: up.id },
//         data: { portfolioValue: totalCostPrice },
//       });

//       // Step 6: Return the created UP with userAssets included (+ useful relations)
//       const withRelations = await tx.userPortfolio.findUnique({
//         where: { id: up.id },
//         include: {
//           user: { include: { wallet: true } },
//           portfolio: {
//             include: {
//               assets: { include: { asset: true } }, // the model portfolio makeup
//             },
//           },
//           userAssets: {
//             include: {
//               portfolioAsset: {
//                 include: {
//                   asset: true,
//                   portfolio: true,
//                 },
//               },
//             },
//           },
//         },
//       });

//       return withRelations;
//     });

//     return res.status(201).json({ data: created, error: null });
//   } catch (err: any) {
//     // Unique constraint on @@unique([userId, portfolioId])
//     if (err?.code === "P2002") {
//       return res.status(409).json({ data: null, error: "User already has this portfolio." });
//     }
//     console.error("createUserPortfolio error:", err);
//     return res.status(500).json({ data: null, error: "Failed to create user-portfolio." });
//   }
// }



export async function createUserPortfolio(req: Request, res: Response) {
  try {
    const { userId, portfolioId } = req.body as { userId?: string; portfolioId?: string };
    if (!userId || !portfolioId) {
      return res.status(400).json({ data: null, error: "userId and portfolioId are required." });
    }

    // Step 1 + 2: fetch user (with wallet) and portfolio (with assets) in parallel
    const [user, portfolio] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, include: { wallet: true } }),
      db.portfolio.findUnique({
        where: { id: portfolioId },
        include: { assets: { include: { asset: true } } }, // PortfolioAsset -> Asset
      }),
    ]);

    if (!user) return res.status(404).json({ data: null, error: "User not found." });
    if (!user.wallet) return res.status(400).json({ data: null, error: "User wallet not found." });
    if (!portfolio) return res.status(404).json({ data: null, error: "Portfolio not found." });

    const walletValue = Number(user.wallet.netAssetValue) || 0;

    // Pre-compute rows for speed
    const rows = portfolio.assets.map((pa) => {
      const alloc = Number(
        (pa.asset as any)?.allocPercent ??
        pa.asset.allocationPercentage ??
        (pa as any)?.allocPercent ??
        (pa as any)?.allocationPercentage ??
        0
      );
      const cps = Number(pa.asset.costPerShare) || 0;
      const close = Number(pa.asset.closePrice) || 0;

      const costPrice = (alloc / 100) * walletValue;
      const stock = cps > 0 ? costPrice / cps : 0;
      const closeValue = close * stock;
      const lossGain = closeValue - costPrice;

      return { paId: pa.id, costPrice, stock, closeValue, lossGain };
    });

    const totalCostPrice = rows.reduce((sum, r) => sum + r.costPrice, 0);

    // Step 3 + 4: do writes inside a transaction (with higher timeout)
    const upId = await db.$transaction(
      async (tx) => {
        // create the UserPortfolio
        const up = await tx.userPortfolio.create({
          data: { userId, portfolioId, portfolioValue: 0 },
        });

        // create UPA rows in bulk (fast)
        if (rows.length) {
          await tx.userPortfolioAsset.createMany({
            data: rows.map((r) => ({
              userPortfolioId: up.id,
              portfolioAssetId: r.paId,
              costPrice: r.costPrice,
              stock: r.stock,
              closeValue: r.closeValue,
              lossGain: r.lossGain,
            })),
            skipDuplicates: true, // safe if re-called
          });
        }

        // update portfolioValue
        await tx.userPortfolio.update({
          where: { id: up.id },
          data: { portfolioValue: totalCostPrice },
        });

        // RETURN ONLY THE ID – do not read relations inside the tx
        return up.id;
      },
      { timeout: 20000, maxWait: 5000 } // ⬅️ increase timeout so heavy portfolios don't trip 5s limit
    );

    // Final read with relations OUTSIDE the transaction to avoid timeout/closure
    const include = parseInclude(req.query) ?? {
      user: { include: { wallet: true } },
      portfolio: { include: { assets: { include: { asset: true } } } },
      userAssets: { include: { portfolioAsset: { include: { asset: true, portfolio: true } } } },
    };

    const withRelations = await db.userPortfolio.findUnique({
      where: { id: upId },
      include,
    });

    return res.status(201).json({ data: withRelations, error: null });
  } catch (err: any) {
    // Unique violation (userId, portfolioId)
    if (err?.code === "P2002") {
      return res.status(409).json({ data: null, error: "User already has this portfolio." });
    }
    console.error("createUserPortfolio error:", err);
    return res.status(500).json({
      data: null,
      error:
        err?.code === "P2028"
          ? "Operation took too long. Try again or contact support."
          : "Failed to create user-portfolio.",
    });
  }
}


/* --------------------------------------------
   LIST  (GET /user-portfolios?userId=&portfolioId=&include=...)
--------------------------------------------- */
export async function listUserPortfolios(req: Request, res: Response) {
  try {
    const { userId, portfolioId } = req.query as { userId?: string; portfolioId?: string };
    const include = parseInclude(req.query);

    const where: Prisma.UserPortfolioWhereInput = {
      ...(userId ? { userId } : {}),
      ...(portfolioId ? { portfolioId } : {}),
    };

    const items = await db.userPortfolio.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: "desc" },
      include,
    });

    return res.status(200).json({ data: items, error: null });
  } catch (err) {
    console.error("listUserPortfolios error:", err);
    return res.status(500).json({ data: null, error: "Failed to load user-portfolios." });
  }
}

/* --------------------------------------------
   READ ONE  (GET /user-portfolios/:id?include=...)
--------------------------------------------- */
export async function getUserPortfolioById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const include = parseInclude(req.query);

    const item = await db.userPortfolio.findUnique({
      where: { id },
      include,
    });

    if (!item) return res.status(404).json({ data: null, error: "UserPortfolio not found." });
    return res.status(200).json({ data: item, error: null });
  } catch (err) {
    console.error("getUserPortfolioById error:", err);
    return res.status(500).json({ data: null, error: "Failed to load user-portfolio." });
  }
}

/* --------------------------------------------
   UPDATE (PATCH /user-portfolios/:id)
   Body supports:
     - portfolioId?: string         // move to another model portfolio
     - recompute?: boolean          // recompute all UPA + portfolioValue
     - resetAssets?: boolean        // delete all UPA, rebuild from model portfolio
--------------------------------------------- */
export async function updateUserPortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const { portfolioId, recompute, resetAssets } = req.body as Partial<{
      portfolioId: string;
      recompute: boolean;
      resetAssets: boolean;
    }>;

    const current = await db.userPortfolio.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!current) return res.status(404).json({ data: null, error: "UserPortfolio not found." });

    const updated = await db.$transaction(async (tx) => {
      // If changing portfolio, validate and update
      if (portfolioId && portfolioId !== current.portfolioId) {
        // ensure target exists
        const target = await tx.portfolio.findUnique({
          where: { id: portfolioId },
          include: { assets: true },
        });
        if (!target) throw new Error("TARGET_PORTFOLIO_NOT_FOUND");

        // enforce uniqueness for (userId, portfolioId)
        const conflict = await tx.userPortfolio.findFirst({
          where: { userId: current.userId, portfolioId, NOT: { id } },
          select: { id: true },
        });
        if (conflict) throw new Error("DUPLICATE_USER_PORTFOLIO");

        await tx.userPortfolio.update({ where: { id }, data: { portfolioId } });
      }

      // Reset assets (drop + rebuild) OR just recompute
      if (resetAssets || (portfolioId && portfolioId !== current.portfolioId)) {
        await tx.userPortfolioAsset.deleteMany({ where: { userPortfolioId: id } });
        await recomputeUPAsFor(id, tx);
      } else if (recompute) {
        await recomputeUPAsFor(id, tx);
      }

      return tx.userPortfolio.findUnique({
        where: { id },
        include: parseInclude(req.query),
      });
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (err: any) {
    if (err?.message === "TARGET_PORTFOLIO_NOT_FOUND") {
      return res.status(404).json({ data: null, error: "Target portfolio not found." });
    }
    if (err?.message === "DUPLICATE_USER_PORTFOLIO") {
      return res.status(409).json({ data: null, error: "This user already has that portfolio." });
    }
    if (err?.code === "P2025") {
      return res.status(404).json({ data: null, error: "UserPortfolio not found." });
    }
    if (err?.code === "P2002") {
      return res.status(409).json({ data: null, error: "This user already has that portfolio." });
    }
    console.error("updateUserPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to update user-portfolio." });
  }
}

/* --------------------------------------------
   RECOMPUTE (POST /user-portfolios/:id/recompute)
--------------------------------------------- */
export async function recomputeUserPortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const exists = await db.userPortfolio.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ data: null, error: "UserPortfolio not found." });

    const result = await db.$transaction(async (tx) => {
      const r = await recomputeUPAsFor(id, tx);
      const fresh = await tx.userPortfolio.findUnique({
        where: { id },
        include: parseInclude(req.query),
      });
      return { r, fresh };
    });

    return res.status(200).json({ data: { recompute: result.r, userPortfolio: result.fresh }, error: null });
  } catch (err) {
    console.error("recomputeUserPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to recompute user-portfolio." });
  }
}

/* --------------------------------------------
   DELETE (DELETE /user-portfolios/:id)
--------------------------------------------- */
export async function deleteUserPortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    await db.$transaction([
      db.userPortfolioAsset.deleteMany({ where: { userPortfolioId: id } }),
      db.userPortfolio.delete({ where: { id } }),
    ]);

    return res.status(200).json({ data: null, message: "UserPortfolio deleted.", error: null });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ data: null, error: "UserPortfolio not found." });
    }
    console.error("deleteUserPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to delete user-portfolio." });
  }
}
