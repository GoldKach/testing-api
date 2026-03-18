// src/controllers/portfolio.ts
import { Request, Response } from "express";
import { db } from "@/db/db";
import { Prisma } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function parseInclude(q: any): Prisma.PortfolioInclude | undefined {
  const raw     = ((q.include as string | undefined) ?? "").toLowerCase();
  const set     = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));

  const includeAssets =
    set.has("assets") || q.includeAssets === "1" || q.includeAssets === "true";
  const includeMembers =
    set.has("userportfolios") || set.has("members") ||
    q.includeMembers === "1"  || q.includeMembers === "true";

  const include: Prisma.PortfolioInclude = {};

  if (includeAssets) {
    include.assets = {
      include: {
        asset: {
          select: {
            id:                          true,
            symbol:                      true,
            description:                 true,
            sector:                      true,
            assetClass:                  true,
            defaultAllocationPercentage: true,
            defaultCostPerShare:         true,
            closePrice:                  true,
          },
        },
      },
    };
  }

  if (includeMembers) {
    include.userPortfolios = {
      where:   { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id:        true,
            firstName: true,
            lastName:  true,
            name:      true,
            email:     true,
            phone:     true,
            role:      true,
            status:    true,
          },
        },
        wallet: {
          select: {
            id:           true,
            accountNumber: true,
            netAssetValue: true,
            balance:      true,
            status:       true,
          },
        },
      },
    } as any;
  }

  return Object.keys(include).length ? include : undefined;
}

/* ------------------------------------------------------------------ */
/*  CREATE  POST /portfolios                                             */
/* ------------------------------------------------------------------ */
export async function createPortfolio(req: Request, res: Response) {
  try {
    const {
      name, description, timeHorizon,
      riskTolerance, allocationPercentage,
    } = req.body as {
      name: string;
      description?: string;
      timeHorizon: string;
      riskTolerance: string;
      allocationPercentage?: number | string;
    };

    if (!name || !timeHorizon || !riskTolerance) {
      return res.status(400).json({
        data: null,
        error: "name, timeHorizon and riskTolerance are required.",
      });
    }

    const exists = await db.portfolio.findUnique({ where: { name }, select: { id: true } });
    if (exists) {
      return res.status(409).json({ data: null, error: "A portfolio with this name already exists." });
    }

    const alloc = clamp(toNumber(allocationPercentage, 100), 0, 100);

    const created = await db.portfolio.create({
      data: {
        name,
        description:          description ?? null,
        timeHorizon,
        riskTolerance,
        allocationPercentage: alloc,
      },
    });

    return res.status(201).json({ data: created, error: null });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Portfolio name must be unique." });
    }
    console.error("createPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to create portfolio." });
  }
}

/* ------------------------------------------------------------------ */
/*  LIST  GET /portfolios                                               */
/* ------------------------------------------------------------------ */
export async function listPortfolios(req: Request, res: Response) {
  try {
    const include = parseInclude(req.query);

    const items = await db.portfolio.findMany({
      orderBy: { createdAt: "desc" },
      include,
    });

    return res.status(200).json({ data: items, error: null });
  } catch (err) {
    console.error("listPortfolios error:", err);
    return res.status(500).json({ data: null, error: "Failed to load portfolios." });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY ID  GET /portfolios/:id                                      */
/* ------------------------------------------------------------------ */
export async function getPortfolioById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const include = parseInclude(req.query);

    const item = await db.portfolio.findUnique({ where: { id }, include });
    if (!item) return res.status(404).json({ data: null, error: "Portfolio not found." });

    return res.status(200).json({ data: item, error: null });
  } catch (err) {
    console.error("getPortfolioById error:", err);
    return res.status(500).json({ data: null, error: "Failed to load portfolio." });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE  PATCH /portfolios/:id                                       */
/* ------------------------------------------------------------------ */
export async function updatePortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const { name, description, timeHorizon, riskTolerance, allocationPercentage } =
      req.body as Partial<{
        name: string;
        description: string | null;
        timeHorizon: string;
        riskTolerance: string;
        allocationPercentage: number | string;
      }>;

    if (name) {
      const conflict = await db.portfolio.findFirst({
        where:  { name, NOT: { id } },
        select: { id: true },
      });
      if (conflict) {
        return res.status(409).json({ data: null, error: "A portfolio with this name already exists." });
      }
    }

    const data: Prisma.PortfolioUpdateInput = {};
    if (name                 !== undefined) data.name                 = name;
    if (description          !== undefined) data.description          = description;
    if (timeHorizon          !== undefined) data.timeHorizon          = timeHorizon;
    if (riskTolerance        !== undefined) data.riskTolerance        = riskTolerance;
    if (allocationPercentage !== undefined) {
      data.allocationPercentage = clamp(toNumber(allocationPercentage, 100), 0, 100);
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ data: null, error: "No updatable fields provided." });
    }

    const updated = await db.portfolio.update({ where: { id }, data });
    return res.status(200).json({ data: updated, error: null });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ data: null, error: "Portfolio not found." });
    }
    if (err?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Portfolio name must be unique." });
    }
    console.error("updatePortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to update portfolio." });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE  DELETE /portfolios/:id                                      */
/* ------------------------------------------------------------------ */
/**
 * Hard delete a portfolio template.
 * Cascade order (FK-safe):
 *   SubPortfolioAssets → SubPortfolios → UserPortfolioAssets →
 *   PortfolioWallets → UserPortfolios → PortfolioAssets → Portfolio
 *
 * Note: TopupEvents and performance reports cascade via UserPortfolio
 * onDelete: Cascade in the schema, so they are cleaned up automatically.
 */
export async function deletePortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    // Collect all UserPortfolio ids for this portfolio template
    const userPortfolios = await db.userPortfolio.findMany({
      where:  { portfolioId: id },
      select: { id: true },
    });
    const upIds = userPortfolios.map((up) => up.id);

    // Collect all SubPortfolio ids
    const subPortfolios = upIds.length
      ? await db.subPortfolio.findMany({
          where:  { userPortfolioId: { in: upIds } },
          select: { id: true },
        })
      : [];
    const subIds = subPortfolios.map((s) => s.id);

    await db.$transaction([
      // 1. Sub-portfolio asset snapshots
      ...(subIds.length
        ? [db.subPortfolioAsset.deleteMany({ where: { subPortfolioId: { in: subIds } } })]
        : []),
      // 2. Sub-portfolios
      ...(upIds.length
        ? [db.subPortfolio.deleteMany({ where: { userPortfolioId: { in: upIds } } })]
        : []),
      // 3. Live user asset positions
      ...(upIds.length
        ? [db.userPortfolioAsset.deleteMany({ where: { userPortfolioId: { in: upIds } } })]
        : []),
      // 4. Portfolio wallets (one per UserPortfolio)
      ...(upIds.length
        ? [db.portfolioWallet.deleteMany({ where: { userPortfolioId: { in: upIds } } })]
        : []),
      // 5. User portfolio enrollments
      ...(upIds.length
        ? [db.userPortfolio.deleteMany({ where: { portfolioId: id } })]
        : []),
      // 6. Template asset rows
      db.portfolioAsset.deleteMany({ where: { portfolioId: id } }),
      // 7. The portfolio template itself
      db.portfolio.delete({ where: { id } }),
    ]);

    return res.status(200).json({ data: null, error: null, message: "Portfolio deleted." });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ data: null, error: "Portfolio not found." });
    }
    console.error("deletePortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to delete portfolio." });
  }
}