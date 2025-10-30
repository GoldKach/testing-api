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
  "allocationPercentage",
  "costPerShare",
  "closePrice",
  "createdAt",
  "updatedAt",
]);

/* ------------------------------- LIST ------------------------------ */
/**
 * GET /assets
 * Query:
 *  - q?: string (search symbol/description/sector)
 *  - sector?: string
 *  - page?: number (default 1)
 *  - pageSize?: number (default 20, max 100)
 *  - sortBy?: "symbol"|"sector"|... (see SORTABLE_FIELDS)
 *  - order?: "asc"|"desc"
 */
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
 * Body: { symbol, description, sector, allocationPercentage?, costPerShare?, closePrice? }
 */
export async function createAsset(req: Request, res: Response) {
  try {
    const {
      symbol,
      description,
      sector,
      allocationPercentage,
      costPerShare,
      closePrice,
    } = req.body as {
      symbol: string;
      description: string;
      sector: string;
      allocationPercentage?: number | string;
      costPerShare?: number | string;
      closePrice?: number | string;
    };

    const sym = normalizeSymbol(symbol || "");
    if (!sym || !description || !sector) {
      return res.status(400).json({ data: null, error: "symbol, description and sector are required" });
    }

    const alloc = clamp(num(allocationPercentage, 0), 0, 100);
    const cps = Math.max(0, num(costPerShare, 0));
    const close = Math.max(0, num(closePrice, 0));

    const created = await db.asset.create({
      data: {
        symbol: sym,
        description,
        sector,
        allocationPercentage: alloc,
        costPerShare: cps,
        closePrice: close,
      },
    });

    return res.status(201).json({ data: created, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Asset symbol already exists" });
    }
    console.error("createAsset error:", error);
    return res.status(500).json({ data: null, error: "Failed to create asset" });
  }
}

/* ------------------------------ UPDATE ----------------------------- */
/** PATCH /assets/:id
 * Body: partial fields (symbol, description, sector, allocationPercentage, costPerShare, closePrice)
 */
export async function updateAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const exists = await db.asset.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ data: null, error: "Asset not found" });

    const {
      symbol,
      description,
      sector,
      allocationPercentage,
      costPerShare,
      closePrice,
    } = req.body as Partial<{
      symbol: string;
      description: string;
      sector: string;
      allocationPercentage: number | string;
      costPerShare: number | string;
      closePrice: number | string;
    }>;

    const data: Prisma.AssetUpdateInput = {};

    if (symbol !== undefined) {
      const sym = normalizeSymbol(symbol);
      if (!sym) return res.status(400).json({ data: null, error: "symbol cannot be empty" });
      data.symbol = sym;
    }
    if (description !== undefined) {
      if (!description) return res.status(400).json({ data: null, error: "description cannot be empty" });
      data.description = description;
    }
    if (sector !== undefined) {
      if (!sector) return res.status(400).json({ data: null, error: "sector cannot be empty" });
      data.sector = sector;
    }
    if (allocationPercentage !== undefined) {
      data.allocationPercentage = clamp(num(allocationPercentage, 0), 0, 100);
    }
    if (costPerShare !== undefined) {
      data.costPerShare = Math.max(0, num(costPerShare, 0));
    }
    if (closePrice !== undefined) {
      data.closePrice = Math.max(0, num(closePrice, 0));
    }

    const updated = await db.asset.update({ where: { id }, data });
    return res.status(200).json({ data: updated, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Asset symbol already exists" });
    }
    console.error("updateAsset error:", error);
    return res.status(500).json({ data: null, error: "Failed to update asset" });
  }
}

/* ------------------------------ DELETE ----------------------------- */
/** DELETE /assets/:id
 * Blocks deletion if referenced by any PortfolioAsset rows.
 */
export async function deleteAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const inUse = await db.portfolioAsset.count({ where: { assetId: id } });
    if (inUse > 0) {
      return res
        .status(409)
        .json({ data: null, error: "Cannot delete: asset is referenced by one or more portfolios" });
    }

    await db.asset.delete({ where: { id } });
    return res.status(200).json({ data: null, error: null, message: "Asset deleted" });
  } catch (error) {
    console.error("deleteAsset error:", error);
    return res.status(500).json({ data: null, error: "Failed to delete asset" });
  }
}
