// src/controllers/portfolio.ts
import { Request, Response } from "express";
import { db } from "@/db/db";
import { Prisma } from "@prisma/client";

/* ----------------- helpers ----------------- */

function toNumber(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function parseInclude(q: any) {
  // supports: ?include=assets,userPortfolios OR booleans ?includeAssets=1&includeMembers=1
  const includeParam = (q.include as string | undefined)?.toLowerCase() ?? "";
  const set = new Set(includeParam.split(",").map((s) => s.trim()).filter(Boolean));
  const includeAssets = set.has("assets") || q.includeAssets === "1" || q.includeAssets === "true";
  const includeMembers =
    set.has("userportfolios") || set.has("members") || q.includeMembers === "1" || q.includeMembers === "true";

  const include: Prisma.PortfolioInclude = {};
  if (includeAssets) {
    include.assets = {
      include: { asset: true }, // assumes PortfolioAsset has relation `asset`
    };
  }
  if (includeMembers) {
    include.userPortfolios = {
      include: { user: true }, // assumes UserPortfolio has relation `user`
    } as any;
  }
  return Object.keys(include).length ? include : undefined;
}

/* --------------------------------------------
   CREATE
--------------------------------------------- */
export async function createPortfolio(req: Request, res: Response) {
  try {
    const {
      name,
      description,
      timeHorizon,
      riskTolerance,
      allocationPercentage,
    } = req.body as {
      name: string;
      description?: string;
      timeHorizon: string;
      riskTolerance: string;
      allocationPercentage?: number | string;
    };

    if (!name || !timeHorizon || !riskTolerance) {
      return res.status(400).json({ data: null, error: "name, timeHorizon and riskTolerance are required." });
    }

    const exists = await db.portfolio.findUnique({ where: { name } });
    if (exists) {
      return res.status(409).json({ data: null, error: "A portfolio with this name already exists." });
    }

    const alloc = clamp(toNumber(allocationPercentage, 100), 0, 100);

    const created = await db.portfolio.create({
      data: {
        name,
        description: description ?? null,
        timeHorizon,
        riskTolerance,
        allocationPercentage: alloc,
      },
    });

    return res.status(201).json({ data: created, error: null });
  } catch (err: any) {
    // unique constraint fallback
    if (err?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Portfolio name must be unique." });
    }
    console.error("createPortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to create portfolio." });
  }
}

/* --------------------------------------------
   LIST
--------------------------------------------- */
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

/* --------------------------------------------
   READ ONE
--------------------------------------------- */
export async function getPortfolioById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const include = parseInclude(req.query);

    const item = await db.portfolio.findUnique({
      where: { id },
      include,
    });

    if (!item) return res.status(404).json({ data: null, error: "Portfolio not found." });
    return res.status(200).json({ data: item, error: null });
  } catch (err) {
    console.error("getPortfolioById error:", err);
    return res.status(500).json({ data: null, error: "Failed to load portfolio." });
  }
}

/* --------------------------------------------
   UPDATE (PATCH)
--------------------------------------------- */
export async function updatePortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    const { name, description, timeHorizon, riskTolerance, allocationPercentage } = req.body as Partial<{
      name: string;
      description: string;
      timeHorizon: string;
      riskTolerance: string;
      allocationPercentage: number | string;
    }>;

    // Unique name check (if changing name)
    if (name) {
      const conflict = await db.portfolio.findFirst({
        where: { name, NOT: { id } },
        select: { id: true },
      });
      if (conflict) {
        return res.status(409).json({ data: null, error: "A portfolio with this name already exists." });
      }
    }

    const data: Prisma.PortfolioUpdateInput = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description === null ? null : description;
    if (timeHorizon !== undefined) data.timeHorizon = timeHorizon;
    if (riskTolerance !== undefined) data.riskTolerance = riskTolerance;
    if (allocationPercentage !== undefined) {
      const alloc = clamp(toNumber(allocationPercentage, 100), 0, 100);
      data.allocationPercentage = alloc;
    }

    const updated = await db.portfolio.update({
      where: { id },
      data,
    });

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

/* --------------------------------------------
   DELETE
--------------------------------------------- */
export async function deletePortfolio(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ data: null, error: "Missing id." });

    // Clean up dependent rows first to avoid FK errors
    await db.$transaction([
      db.portfolioAsset.deleteMany({ where: { portfolioId: id } }),
      db.userPortfolio.deleteMany({ where: { portfolioId: id } }),
      db.portfolio.delete({ where: { id } }),
    ]);

    return res.status(200).json({ data: null, message: "Portfolio deleted.", error: null });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ data: null, error: "Portfolio not found." });
    }
    console.error("deletePortfolio error:", err);
    return res.status(500).json({ data: null, error: "Failed to delete portfolio." });
  }
}
