

// src/controllers/assets.ts
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { db } from "@/db/db";

/* ----------------------------- helpers ----------------------------- */

function normalizeSymbol(sym: string) {
  return sym?.trim().toUpperCase();
}

function num(v: any, def = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : def;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const SORTABLE_FIELDS = new Set<keyof Prisma.AssetOrderByWithRelationInput>([
  "symbol",
  "sector",
  "defaultAllocationPercentage",
  "defaultCostPerShare",
  "closePrice",
  "createdAt",
  "updatedAt",
]);

export async function listAssets(req: Request, res: Response) {
  try {
    const q = (req.query.q as string) || "";
    const sectorQ = (req.query.sector as string) || "";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

    const sortByRaw = (req.query.sortBy as string) || "createdAt";
    const sortBy = SORTABLE_FIELDS.has(sortByRaw as any) ? (sortByRaw as any) : "createdAt";
    const order = ((req.query.order as string) === "asc" ? "asc" : "desc") as "asc" | "desc";

    const where: Prisma.AssetWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { symbol: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { sector: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        sectorQ ? { sector: { contains: sectorQ, mode: "insensitive" } } : {},
      ],
    };

    const [total, items] = await db.$transaction([
      db.asset.count({ where }),
      db.asset.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return res.status(200).json({
      data: items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      error: null,
    });
  } catch (error) {
    console.error("listAssets error:", error);
    return res.status(500).json({ data: null, error: "Failed to list assets" });
  }
}

/* ------------------------------- GET ------------------------------- */
/** GET /assets/:id */
export async function getAssetById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const asset = await db.asset.findUnique({ where: { id } });
    if (!asset) return res.status(404).json({ data: null, error: "Asset not found" });
    return res.status(200).json({ data: asset, error: null });
  } catch (error) {
    console.error("getAssetById error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch asset" });
  }
}

/** GET /assets/symbol/:symbol */
export async function getAssetBySymbol(req: Request, res: Response) {
  try {
    const symbol = normalizeSymbol(req.params.symbol || "");
    if (!symbol) return res.status(400).json({ data: null, error: "Symbol is required" });

    const asset = await db.asset.findUnique({ where: { symbol } });
    if (!asset) return res.status(404).json({ data: null, error: "Asset not found" });
    return res.status(200).json({ data: asset, error: null });
  } catch (error) {
    console.error("getAssetBySymbol error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch asset" });
  }
}

/* ------------------------------ CREATE ----------------------------- */
/** POST /assets
 * Body: { symbol, description, sector, assetClass?, defaultAllocationPercentage?, defaultCostPerShare?, closePrice? }
 * ✅ UPDATED: Uses defaultAllocationPercentage and defaultCostPerShare
 */
export async function createAsset(req: Request, res: Response) {
  try {
    const {
      symbol,
      description,
      sector,
      assetClass,
      defaultAllocationPercentage,
      defaultCostPerShare,
      closePrice,
    } = req.body as {
      symbol: string;
      description: string;
      sector: string;
      assetClass?: "EQUITIES" | "ETFS" | "REITS" | "BONDS" | "CASH" | "OTHERS";
      defaultAllocationPercentage?: number | string;
      defaultCostPerShare?: number | string;
      closePrice?: number | string;
    };

    // --- VALIDATION ---
    const sym = symbol?.trim()?.toUpperCase();
    if (!sym || !description || !sector) {
      return res.status(400).json({
        data: null,
        error: "symbol, description, and sector are required",
      });
    }

    const alloc = defaultAllocationPercentage
      ? Math.min(Math.max(Number(defaultAllocationPercentage), 0), 100)
      : 0;

    const cps = defaultCostPerShare ? Math.max(0, Number(defaultCostPerShare)) : 0;
    const close = closePrice ? Math.max(0, Number(closePrice)) : 0;

    // --- CREATE ASSET ---
    const created = await db.asset.create({
      data: {
        symbol: sym,
        description: description.trim(),
        sector: sector.trim(),
        assetClass: assetClass ?? undefined,
        defaultAllocationPercentage: alloc,
        defaultCostPerShare: cps,
        closePrice: close,
      },
    });

    return res.status(201).json({
      data: created,
      error: null,
    });
  } catch (error: any) {
    console.error("createAsset error:", error);

    if (error?.code === "P2002") {
      return res.status(409).json({
        data: null,
        error: "Asset symbol already exists",
      });
    }

    return res.status(500).json({
      data: null,
      error: "Failed to create asset",
    });
  }
}

/* ------------------------------ UPDATE ----------------------------- */
/** PATCH /assets/:id
 * Body: { symbol?, description?, sector?, assetClass?, defaultAllocationPercentage?, defaultCostPerShare?, closePrice? }
 * ✅ FIXED: No longer cascades to UserPortfolioAsset
 * Users have independent allocations now
 */
// export async function updateAsset(req: Request, res: Response) {
//   try {
//     const { id } = req.params;

//     const exists = await db.asset.findUnique({ where: { id } });
//     if (!exists) return res.status(404).json({ data: null, error: "Asset not found" });

//     const {
//       symbol,
//       description,
//       sector,
//       assetClass,
//       defaultAllocationPercentage,
//       defaultCostPerShare,
//       closePrice,
//     } = req.body as Partial<{
//       symbol: string;
//       description: string;
//       sector: string;
//       assetClass: "EQUITIES" | "ETFS" | "REITS" | "BONDS" | "CASH" | "OTHERS";
//       defaultAllocationPercentage: number | string;
//       defaultCostPerShare: number | string;
//       closePrice: number | string;
//     }>;

//     const patch: Prisma.AssetUpdateInput = {};

//     if (symbol !== undefined) {
//       const sym = normalizeSymbol(symbol);
//       if (!sym) return res.status(400).json({ data: null, error: "symbol cannot be empty" });
//       patch.symbol = sym;
//     }
//     if (description !== undefined) {
//       if (!description) return res.status(400).json({ data: null, error: "description cannot be empty" });
//       patch.description = description;
//     }
//     if (sector !== undefined) {
//       if (!sector) return res.status(400).json({ data: null, error: "sector cannot be empty" });
//       patch.sector = sector;
//     }
//     if (assetClass !== undefined) {
//       patch.assetClass = assetClass;
//     }
//     if (defaultAllocationPercentage !== undefined) {
//       patch.defaultAllocationPercentage = clamp(num(defaultAllocationPercentage, 0), 0, 100);
//     }
//     if (defaultCostPerShare !== undefined) {
//       patch.defaultCostPerShare = Math.max(0, num(defaultCostPerShare, 0));
//     }
//     if (closePrice !== undefined) {
//       patch.closePrice = Math.max(0, num(closePrice, 0));
//     }

//     // Nothing to update?
//     if (Object.keys(patch).length === 0) {
//       return res.status(200).json({ data: exists, error: null });
//     }

//     // ✅ SIMPLE UPDATE: No cascade to UserPortfolioAsset
//     // Users have their own independent allocations now
//     // If you want to update user portfolios when closePrice changes, 
//     // you should do that through a separate recompute endpoint
//     const updated = await db.asset.update({
//       where: { id },
//       data: patch,
//     });

//     return res.status(200).json({ 
//       data: updated, 
//       error: null,
//       // ⚠️ Optional: Add a note if closePrice was updated
//       ...(closePrice !== undefined ? { 
//         note: "Asset closePrice updated. User portfolios will be recalculated on next deposit/withdrawal or manual recompute."
//       } : {})
//     });
//   } catch (error: any) {
//     if (error?.code === "P2002") {
//       return res.status(409).json({ data: null, error: "Asset symbol already exists" });
//     }
//     console.error("updateAsset error:", error);
//     return res.status(500).json({ data: null, error: "Failed to update asset" });
//   }
// }


export async function updateAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const exists = await db.asset.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ data: null, error: "Asset not found" });

    const {
      symbol,
      description,
      sector,
      assetClass,
      defaultAllocationPercentage,
      defaultCostPerShare,
      closePrice,
    } = req.body as Partial<{
      symbol: string;
      description: string;
      sector: string;
      assetClass: "EQUITIES" | "ETFS" | "REITS" | "BONDS" | "CASH" | "OTHERS";
      defaultAllocationPercentage: number | string;
      defaultCostPerShare: number | string;
      closePrice: number | string;
    }>;

    const patch: Prisma.AssetUpdateInput = {};

    if (symbol !== undefined) {
      const sym = normalizeSymbol(symbol);
      if (!sym) return res.status(400).json({ data: null, error: "symbol cannot be empty" });
      patch.symbol = sym;
    }
    if (description !== undefined) {
      if (!description) return res.status(400).json({ data: null, error: "description cannot be empty" });
      patch.description = description;
    }
    if (sector !== undefined) {
      if (!sector) return res.status(400).json({ data: null, error: "sector cannot be empty" });
      patch.sector = sector;
    }
    if (assetClass !== undefined) {
      patch.assetClass = assetClass;
    }
    if (defaultAllocationPercentage !== undefined) {
      patch.defaultAllocationPercentage = clamp(num(defaultAllocationPercentage, 0), 0, 100);
    }
    if (defaultCostPerShare !== undefined) {
      patch.defaultCostPerShare = Math.max(0, num(defaultCostPerShare, 0));
    }
    if (closePrice !== undefined) {
      patch.closePrice = Math.max(0, num(closePrice, 0));
    }

    if (Object.keys(patch).length === 0) {
      return res.status(200).json({ data: exists, error: null });
    }

    // 1) Update the asset — simple, fast transaction
    const updated = await db.asset.update({ where: { id }, data: patch });

    // 2) Respond immediately — don't make the client wait for cascade
    res.status(200).json({ data: updated, error: null });

    // 3) Run cascade in background AFTER response is sent
    if (patch.closePrice !== undefined) {
      cascadeClosePriceUpdate(id, Number(patch.closePrice)).catch((err) =>
        console.error(`[cascadeClosePriceUpdate] assetId=${id}`, err)
      );
    }
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Asset symbol already exists" });
    }
    console.error("updateAsset error:", error);
    return res.status(500).json({ data: null, error: "Failed to update asset" });
  }
}

/* ------------------------------------------------------------------ */
/*  Background cascade — runs after response is already sent           */
/* ------------------------------------------------------------------ */
async function cascadeClosePriceUpdate(assetId: string, newClosePrice: number) {
  console.log(`[cascade] starting closePrice cascade for assetId=${assetId}, newClosePrice=${newClosePrice}`);

  // 1) Fetch all affected records
  const [portfolioAssets, userAssets] = await Promise.all([
    db.portfolioAsset.findMany({
      where: { assetId },
      select: { id: true, stock: true, costPrice: true },
    }),
    db.userPortfolioAsset.findMany({
      where: { assetId },
      select: { id: true, stock: true, costPrice: true, userPortfolioId: true },
    }),
  ]);

  // 2) Update PortfolioAssets in parallel
  await Promise.all(
    portfolioAssets.map((pa) => {
      const closeValue = newClosePrice * Number(pa.stock);
      return db.portfolioAsset.update({
        where: { id: pa.id },
        data: {
          closeValue,
          lossGain: closeValue - Number(pa.costPrice ?? 0),
        },
      });
    })
  );

  // 3) Update UserPortfolioAssets in parallel
  await Promise.all(
    userAssets.map((ua) => {
      const closeValue = newClosePrice * Number(ua.stock);
      return db.userPortfolioAsset.update({
        where: { id: ua.id },
        data: {
          closeValue,
          lossGain: closeValue - Number(ua.costPrice ?? 0),
        },
      });
    })
  );

  // 4) Recompute affected UserPortfolio.portfolioValue
  const affectedUserPortfolioIds = [...new Set(userAssets.map((ua) => ua.userPortfolioId))];

  await Promise.all(
    affectedUserPortfolioIds.map(async (upId) => {
      const rows = await db.userPortfolioAsset.findMany({
        where: { userPortfolioId: upId },
        select: { closeValue: true },
      });
      const total = rows.reduce((s, r) => s + Number(r.closeValue ?? 0), 0);
      return db.userPortfolio.update({
        where: { id: upId },
        data: { portfolioValue: total },
      });
    })
  );

  console.log(
    `[cascade] done — updated ${portfolioAssets.length} portfolioAssets, ` +
    `${userAssets.length} userPortfolioAssets, ` +
    `${affectedUserPortfolioIds.length} userPortfolios`
  );
}

/* ------------------------------ DELETE ----------------------------- */
/** DELETE /assets/:id
 * Blocks deletion if referenced by any UserPortfolioAsset rows.
 */
export async function deleteAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // Check if asset is in use by any user portfolios
    const inUse = await db.userPortfolioAsset.count({ where: { assetId: id } });
    if (inUse > 0) {
      return res
        .status(409)
        .json({ 
          data: null, 
          error: `Cannot delete: asset is referenced by ${inUse} user portfolio(s)` 
        });
    }

    // Also check PortfolioAsset (template)
    const inPortfolio = await db.portfolioAsset.count({ where: { assetId: id } });
    if (inPortfolio > 0) {
      return res
        .status(409)
        .json({ 
          data: null, 
          error: `Cannot delete: asset is referenced by ${inPortfolio} portfolio(s)` 
        });
    }

    await db.asset.delete({ where: { id } });
    return res.status(200).json({ data: null, error: null, message: "Asset deleted" });
  } catch (error) {
    console.error("deleteAsset error:", error);
    return res.status(500).json({ data: null, error: "Failed to delete asset" });
  }
}

/* ------------------------------ BATCH UPDATE CLOSE PRICES ----------------------------- */
/**
 * POST /assets/batch-update-prices
 * Body: { updates: [{ assetId: string, closePrice: number }] }
 * Updates multiple asset close prices at once (e.g., from market data feed)
 */
export async function batchUpdateAssetPrices(req: Request, res: Response) {
  try {
    const { updates } = req.body as {
      updates?: Array<{ assetId: string; closePrice: number }>;
    };

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        data: null,
        error: "updates array is required with at least one price update",
      });
    }

    const results = await db.$transaction(
      updates.map((update) =>
        db.asset.update({
          where: { id: update.assetId },
          data: { closePrice: Math.max(0, Number(update.closePrice)) },
        })
      )
    );

    return res.status(200).json({
      data: results,
      message: `Updated ${results.length} asset prices`,
      note: "User portfolios will be recalculated on next deposit/withdrawal or manual recompute.",
      error: null,
    });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return res.status(404).json({ data: null, error: "One or more assets not found" });
    }
    console.error("batchUpdateAssetPrices error:", error);
    return res.status(500).json({ data: null, error: "Failed to batch update asset prices" });
  }
}