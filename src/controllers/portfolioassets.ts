import { Request, Response } from "express";
import { db } from "@/db/db";

/* helpers */
const toNum = (v: any, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const calcLossGain = (costPrice: number, closeValue: number, stock: number) =>
  (closeValue - costPrice) * stock;

/** POST /portfolioassets */
export async function createPortfolioAsset(req: Request, res: Response) {
  try {
    const { portfolioId, assetId } = req.body as { portfolioId?: string; assetId?: string };
    if (!portfolioId || !assetId) {
      return res.status(400).json({ error: "portfolioId and assetId are required." });
    }

    // optional numeric fields
    const stock = toNum((req.body as any).stock, 0);
    const costPrice = toNum((req.body as any).costPrice, 0);

    // default closeValue to Asset.closePrice if not provided
    let closeValue = (req.body as any).closeValue;
    if (closeValue === undefined || closeValue === null || closeValue === "") {
      const a = await db.asset.findUnique({ where: { id: assetId }, select: { closePrice: true } });
      if (!a) return res.status(404).json({ error: "Asset not found." });
      closeValue = a.closePrice;
    }
    closeValue = toNum(closeValue, 0);

    // existence checks
    const [p, a] = await Promise.all([
      db.portfolio.findUnique({ where: { id: portfolioId }, select: { id: true } }),
      db.asset.findUnique({ where: { id: assetId }, select: { id: true } }),
    ]);
    if (!p) return res.status(404).json({ error: "Portfolio not found." });
    if (!a) return res.status(404).json({ error: "Asset not found." });

    const lossGain = calcLossGain(costPrice, closeValue, stock);

    const row = await db.portfolioAsset.create({
      data: { portfolioId, assetId, stock, costPrice, closeValue, lossGain },
      include: {
        asset: { select: { id: true, symbol: true, description: true, sector: true, costPerShare: true, closePrice: true } },
        portfolio: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({ data: row });
  } catch (e: any) {
    if (e?.code === "P2002") {
      // @@unique([portfolioId, assetId])
      return res.status(409).json({ error: "Asset already exists in this portfolio." });
    }
    console.error("createPortfolioAsset error:", e);
    return res.status(500).json({ error: "Failed to create portfolio asset." });
  }
}

/** GET /portfolioassets?portfolioId=... */
export async function listPortfolioAssets(req: Request, res: Response) {
  try {
    const { portfolioId } = req.query as { portfolioId?: string };
    const where = portfolioId ? { portfolioId } : undefined;

    const rows = await db.portfolioAsset.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        asset: { select: { id: true, symbol: true, description: true, sector: true, costPerShare: true, closePrice: true } },
        portfolio: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({ data: rows });
  } catch (e) {
    console.error("listPortfolioAssets error:", e);
    return res.status(500).json({ error: "Failed to load portfolio assets." });
  }
}

/** GET /portfolioassets/:id */
export async function getPortfolioAssetById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const row = await db.portfolioAsset.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, symbol: true, description: true, sector: true, costPerShare: true, closePrice: true } },
        portfolio: { select: { id: true, name: true } },
      },
    });
    if (!row) return res.status(404).json({ error: "Portfolio asset not found." });
    return res.status(200).json({ data: row });
  } catch (e) {
    console.error("getPortfolioAssetById error:", e);
    return res.status(500).json({ error: "Failed to load portfolio asset." });
  }
}

/** PATCH /portfolioassets/:id */
export async function updatePortfolioAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const current = await db.portfolioAsset.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: "Portfolio asset not found." });

    const stock = (req.body as any).stock !== undefined ? toNum((req.body as any).stock, current.stock) : current.stock;
    const costPrice =
      (req.body as any).costPrice !== undefined ? toNum((req.body as any).costPrice, current.costPrice) : current.costPrice;
    const closeValue =
      (req.body as any).closeValue !== undefined ? toNum((req.body as any).closeValue, current.closeValue) : current.closeValue;

    const lossGain = calcLossGain(costPrice, closeValue, stock);

    const updated = await db.portfolioAsset.update({
      where: { id },
      data: { stock, costPrice, closeValue, lossGain },
      include: {
        asset: { select: { id: true, symbol: true, description: true, sector: true, costPerShare: true, closePrice: true } },
        portfolio: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({ data: updated });
  } catch (e) {
    console.error("updatePortfolioAsset error:", e);
    return res.status(500).json({ error: "Failed to update portfolio asset." });
  }
}

/** DELETE /portfolioassets/:id */
export async function deletePortfolioAsset(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await db.portfolioAsset.delete({ where: { id } });
    return res.status(204).send();
  } catch (e: any) {
    if (e?.code === "P2025") return res.status(404).json({ error: "Portfolio asset not found." });
    console.error("deletePortfolioAsset error:", e);
    return res.status(500).json({ error: "Failed to delete portfolio asset." });
  }
}

/** convenience: GET /portfolios/:portfolioId/portfolioassets */
export async function listPortfolioAssetsForPortfolio(req: Request, res: Response) {
  req.query.portfolioId = req.params.portfolioId;
  return listPortfolioAssets(req, res);
}
