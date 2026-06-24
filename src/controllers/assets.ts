

// src/controllers/assets.ts
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { db } from "@/db/db";
import { cascadeClosePriceUpdates, recordAssetPriceHistory } from "@/utils/cascade";

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

    // 3) Run cascade + price history recording in background AFTER response is sent
    if (patch.closePrice !== undefined) {
      const priceUpdate = [{ assetId: id, closePrice: Number(patch.closePrice) }];
      cascadeClosePriceUpdates(priceUpdate).catch((err) =>
        console.error(`[cascadeClosePriceUpdates] assetId=${id}`, err)
      );
      recordAssetPriceHistory(priceUpdate).catch((err) =>
        console.error(`[recordAssetPriceHistory] assetId=${id}`, err)
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

// cascadeClosePriceUpdates is imported from @/utils/cascade

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

/* ------------------------------ ASSET PRICE HISTORY ----------------------------- */

/**
 * GET /assets/price-history?date=YYYY-MM-DD
 * Returns all assets with their close price on the requested date.
 * Uses the most recent AssetPriceHistory row on or before the date,
 * falling back to Asset.closePrice if no history exists for that asset yet.
 */
export async function getAssetPriceHistory(req: Request, res: Response) {
  try {
    const dateStr = req.query.date as string;
    if (!dateStr) {
      return res.status(400).json({ data: null, error: "date query param is required (YYYY-MM-DD)" });
    }

    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ data: null, error: "Invalid date format — use YYYY-MM-DD" });
    }

    const [assets, historyRows] = await Promise.all([
      db.asset.findMany({
        orderBy: { symbol: "asc" },
        select: { id: true, symbol: true, description: true, sector: true, assetClass: true, closePrice: true },
      }),
      db.assetPriceHistory.findMany({
        where: { priceDate: { lte: new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1) } },
        orderBy: { priceDate: "desc" },
      }),
    ]);

    // Most-recent price per asset on or before the requested date
    const historicalMap = new Map<string, { closePrice: number; priceDate: Date }>();
    for (const row of historyRows) {
      if (!historicalMap.has(row.assetId)) {
        historicalMap.set(row.assetId, { closePrice: Number(row.closePrice), priceDate: row.priceDate });
      }
    }

    const result = assets.map((asset) => {
      const h = historicalMap.get(asset.id);
      return {
        id:              asset.id,
        symbol:          asset.symbol,
        description:     asset.description,
        sector:          asset.sector,
        assetClass:      asset.assetClass,
        liveClosePrice:  Number(asset.closePrice),  // current live price
        historicalPrice: h?.closePrice ?? Number(asset.closePrice),
        priceDate:       h?.priceDate ?? null,
        hasHistory:      !!h,
      };
    });

    return res.status(200).json({ data: result, queryDate: date.toISOString(), error: null });
  } catch (error) {
    console.error("getAssetPriceHistory error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch asset price history" });
  }
}

/**
 * POST /assets/price-history/batch
 * Body: { date: "YYYY-MM-DD", prices: [{ assetId, closePrice }] }
 * Upserts one AssetPriceHistory row per asset for the given date.
 * Idempotent — safe to call multiple times for the same date.
 */
export async function batchUpsertAssetPriceHistory(req: Request, res: Response) {
  try {
    const { date: dateStr, prices } = req.body as {
      date?: string;
      prices?: Array<{ assetId: string; closePrice: number }>;
    };

    if (!dateStr) {
      return res.status(400).json({ data: null, error: "date is required (YYYY-MM-DD)" });
    }
    if (!prices || !Array.isArray(prices) || prices.length === 0) {
      return res.status(400).json({ data: null, error: "prices array is required" });
    }

    const date = new Date(dateStr);
    date.setUTCHours(0, 0, 0, 0);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ data: null, error: "Invalid date format — use YYYY-MM-DD" });
    }

    const validated = prices.map((p) => ({
      assetId:    p.assetId,
      closePrice: Math.max(0, Number(p.closePrice) || 0),
    }));

    await recordAssetPriceHistory(validated, date);

    return res.status(200).json({
      data:    { count: validated.length, date: date.toISOString().slice(0, 10) },
      message: `Saved ${validated.length} price(s) for ${dateStr}`,
      error:   null,
    });
  } catch (error) {
    console.error("batchUpsertAssetPriceHistory error:", error);
    return res.status(500).json({ data: null, error: "Failed to save asset price history" });
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

    const validUpdates = updates.map((u) => ({
      assetId:    u.assetId,
      closePrice: Math.max(0, Number(u.closePrice)),
    }));

    const results = await db.$transaction(
      validUpdates.map((u) =>
        db.asset.update({
          where: { id: u.assetId },
          data:  { closePrice: u.closePrice },
        })
      )
    );

    // Respond immediately, then cascade all price changes together in one pass
    res.status(200).json({
      data:    results,
      message: `Updated ${results.length} asset prices. Portfolio values are recalculating in the background.`,
      error:   null,
    });

    cascadeClosePriceUpdates(validUpdates).catch((err) =>
      console.error(`[cascadeClosePriceUpdates] batch (${validUpdates.length} assets)`, err)
    );
    recordAssetPriceHistory(validUpdates).catch((err) =>
      console.error(`[recordAssetPriceHistory] batch (${validUpdates.length} assets)`, err)
    );
  } catch (error: any) {
    if (error?.code === "P2025") {
      return res.status(404).json({ data: null, error: "One or more assets not found" });
    }
    console.error("batchUpdateAssetPrices error:", error);
    return res.status(500).json({ data: null, error: "Failed to batch update asset prices" });
  }
}