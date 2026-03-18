// src/controllers/portfolio-assets.ts
import { Request, Response } from "express";
import { db } from "@/db/db";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const toNum = (v: any, def = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/**
 * lossGain = closeValue - costPrice
 * (closeValue already incorporates stock count via stock * closePrice)
 */
const calcLossGain = (costPrice: number, closeValue: number): number =>
  closeValue - costPrice;

const ASSET_SELECT = {
  id:                          true,
  symbol:                      true,
  description:                 true,
  sector:                      true,
  assetClass:                  true,
  defaultAllocationPercentage: true,
  defaultCostPerShare:         true,
  closePrice:                  true,
} as const;

/* ------------------------------------------------------------------ */
/*  CREATE  POST /portfolio-assets                                      */
/* ------------------------------------------------------------------ */
/**
 * Creates a template PortfolioAsset (the default allocation for a fund).
 * These are the DEFAULTS used when enrolling a new user into this portfolio.
 * Individual users can override allocationPercentage and costPerShare
 * via their UserPortfolioAsset records.
 *
 * Body: {
 *   portfolioId, assetId,
 *   defaultAllocationPercentage?,   ← falls back to asset.defaultAllocationPercentage
 *   defaultCostPerShare?,           ← falls back to asset.defaultCostPerShare
 *   stock?, costPrice?, closeValue?
 * }
 */
export async function createPortfolioAsset(req: Request, res: Response) {
  try {
    const {
      portfolioId,
      assetId,
      defaultAllocationPercentage,
      defaultCostPerShare,
    } = req.body as {
      portfolioId?: string;
      assetId?: string;
      defaultAllocationPercentage?: number;
      defaultCostPerShare?: number;
    };

    if (!portfolioId || !assetId) {
      return res.status(400).json({ data: null, error: "portfolioId and assetId are required." });
    }

    // Existence checks in parallel
    const [portfolio, asset] = await Promise.all([
      db.portfolio.findUnique({ where: { id: portfolioId }, select: { id: true } }),
      db.asset.findUnique({
        where:  { id: assetId },
        select: {
          id:                          true,
          closePrice:                  true,
          defaultAllocationPercentage: true,
          defaultCostPerShare:         true,
        },
      }),
    ]);

    if (!portfolio) return res.status(404).json({ data: null, error: "Portfolio not found." });
    if (!asset)     return res.status(404).json({ data: null, error: "Asset not found." });

    // Resolve optional numeric fields
    const stock      = toNum((req.body as any).stock,      0);
    const costPrice  = toNum((req.body as any).costPrice,  0);
    const closeValue = (req.body as any).closeValue !== undefined && (req.body as any).closeValue !== ""
      ? toNum((req.body as any).closeValue, 0)
      : toNum(asset.closePrice, 0);

    // Fall back to asset-level defaults if not provided
    const allocPercent = defaultAllocationPercentage !== undefined
      ? toNum(defaultAllocationPercentage, 0)
      : toNum(asset.defaultAllocationPercentage, 0);

    const costPerShare = defaultCostPerShare !== undefined
      ? toNum(defaultCostPerShare, 0)
      : toNum(asset.defaultCostPerShare, 0);

    const lossGain = calcLossGain(costPrice, closeValue);

    const row = await db.portfolioAsset.create({
      data: {
        portfolioId,
        assetId,
        stock,
        costPrice,
        closeValue,
        lossGain,
        defaultAllocationPercentage: allocPercent,
        defaultCostPerShare:         costPerShare,
      },
      include: {
        asset:     { select: ASSET_SELECT },
        portfolio: { select: { id: true, name: true, riskTolerance: true, timeHorizon: true } },
      },
    });

    return res.status(201).json({ data: row, error: null });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Asset already exists in this portfolio." });
    }
    console.error("createPortfolioAsset error:", e);
    return res.status(500).json({ data: null, error: "Failed to create portfolio asset." });
  }
}

/* ------------------------------------------------------------------ */
/*  LIST  GET /portfolio-assets?portfolioId=...                         */
/* ------------------------------------------------------------------ */
export async function listPortfolioAssets(req: Request, res: Response) {
  try {
    const { portfolioId } = req.query as { portfolioId?: string };

    const rows = await db.portfolioAsset.findMany({
      where:   portfolioId ? { portfolioId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        asset:     { select: ASSET_SELECT },
        portfolio: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({ data: rows, error: null });
  } catch (e) {
    console.error("listPortfolioAssets error:", e);
    return res.status(500).json({ data: null, error: "Failed to load portfolio assets." });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY ID  GET /portfolio-assets/:id                                */
/* ------------------------------------------------------------------ */
export async function getPortfolioAssetById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const row = await db.portfolioAsset.findUnique({
      where:   { id },
      include: {
        asset:     { select: ASSET_SELECT },
        portfolio: { select: { id: true, name: true } },
      },
    });

    if (!row) return res.status(404).json({ data: null, error: "Portfolio asset not found." });
    return res.status(200).json({ data: row, error: null });
  } catch (e) {
    console.error("getPortfolioAssetById error:", e);
    return res.status(500).json({ data: null, error: "Failed to load portfolio asset." });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE  PATCH /portfolio-assets/:id                                 */
/* ------------------------------------------------------------------ */
/**
 * Updates the TEMPLATE defaults for this portfolio asset.
 * Does NOT touch any UserPortfolioAsset records — those are managed
 * independently per user enrollment.
 */
export async function updatePortfolioAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const current = await db.portfolioAsset.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ data: null, error: "Portfolio asset not found." });

    const body = req.body as Partial<{
      stock:                       number | string;
      costPrice:                   number | string;
      closeValue:                  number | string;
      defaultAllocationPercentage: number | string;
      defaultCostPerShare:         number | string;
    }>;

    const stock      = body.stock      !== undefined ? toNum(body.stock,      current.stock)      : current.stock;
    const costPrice  = body.costPrice  !== undefined ? toNum(body.costPrice,  current.costPrice)  : current.costPrice;
    const closeValue = body.closeValue !== undefined ? toNum(body.closeValue, current.closeValue) : current.closeValue;

    const defaultAllocationPercentage = body.defaultAllocationPercentage !== undefined
      ? toNum(body.defaultAllocationPercentage, current.defaultAllocationPercentage)
      : current.defaultAllocationPercentage;

    const defaultCostPerShare = body.defaultCostPerShare !== undefined
      ? toNum(body.defaultCostPerShare, current.defaultCostPerShare)
      : current.defaultCostPerShare;

    const lossGain = calcLossGain(costPrice, closeValue);

    const updated = await db.portfolioAsset.update({
      where: { id },
      data:  {
        stock,
        costPrice,
        closeValue,
        lossGain,
        defaultAllocationPercentage,
        defaultCostPerShare,
      },
      include: {
        asset:     { select: ASSET_SELECT },
        portfolio: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return res.status(404).json({ data: null, error: "Portfolio asset not found." });
    }
    console.error("updatePortfolioAsset error:", e);
    return res.status(500).json({ data: null, error: "Failed to update portfolio asset." });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE  DELETE /portfolio-assets/:id                                */
/* ------------------------------------------------------------------ */
/**
 * Deletes only the template PortfolioAsset row.
 * Existing UserPortfolioAsset records are NOT affected — they are
 * independent per-user positions with their own data.
 */
export async function deletePortfolioAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await db.portfolioAsset.delete({ where: { id } });
    return res.status(200).json({ data: null, error: null, message: "Portfolio asset deleted." });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return res.status(404).json({ data: null, error: "Portfolio asset not found." });
    }
    console.error("deletePortfolioAsset error:", e);
    return res.status(500).json({ data: null, error: "Failed to delete portfolio asset." });
  }
}

/* ------------------------------------------------------------------ */
/*  CONVENIENCE  GET /portfolios/:portfolioId/assets                    */
/* ------------------------------------------------------------------ */
export async function listPortfolioAssetsForPortfolio(req: Request, res: Response) {
  req.query.portfolioId = req.params.portfolioId;
  return listPortfolioAssets(req, res);
}