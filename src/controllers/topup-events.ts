// src/controllers/topup-events.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { Prisma } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Shared include                                                       */
/* ------------------------------------------------------------------ */

const TOPUP_INCLUDE: Prisma.TopupEventInclude = {
  deposit: {
    select: {
      id: true, amount: true, transactionStatus: true,
      createdByName: true, approvedByName: true, createdAt: true,
    },
  },
  userPortfolio: {
    select: {
      id: true, customName: true, userId: true,
      portfolio: { select: { id: true, name: true } },
    },
  },
  mergedSubPortfolios: {
    orderBy: { generation: "asc" },
    include: { assets: { include: { asset: true } } },
  },
};

/* ------------------------------------------------------------------ */
/*  LIST  GET /topup-events?userPortfolioId=...&status=...              */
/* ------------------------------------------------------------------ */
/**
 * Full audit trail of all top-up events for a portfolio.
 * Shows what X + X1 merged into, with before/after totals.
 */
export async function listTopupEvents(req: Request, res: Response) {
  try {
    const { userPortfolioId, userId, status } = req.query as {
      userPortfolioId?: string; userId?: string; status?: string;
    };

    const page     = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

    const where: Prisma.TopupEventWhereInput = {
      ...(userPortfolioId ? { userPortfolioId } : {}),
      ...(userId          ? { userPortfolio: { userId } } : {}),
      ...(status          ? { status: status as any }     : {}),
    };

    const [total, items] = await db.$transaction([
      db.topupEvent.count({ where }),
      db.topupEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
        include: TOPUP_INCLUDE,
      }),
    ]);

    return res.status(200).json({
      data: items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      error: null,
    });
  } catch (err) {
    console.error("listTopupEvents error:", err);
    return res.status(500).json({ data: null, error: "Failed to list top-up events" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY ID  GET /topup-events/:id                                    */
/* ------------------------------------------------------------------ */
export async function getTopupEventById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const event = await db.topupEvent.findUnique({
      where:   { id },
      include: TOPUP_INCLUDE,
    });
    if (!event) return res.status(404).json({ data: null, error: "TopupEvent not found" });

    return res.status(200).json({ data: event, error: null });
  } catch (err) {
    console.error("getTopupEventById error:", err);
    return res.status(500).json({ data: null, error: "Failed to fetch top-up event" });
  }
}

/* ------------------------------------------------------------------ */
/*  GET BY PORTFOLIO  GET /topup-events/portfolio/:userPortfolioId      */
/* ------------------------------------------------------------------ */
/**
 * Returns a timeline of all merges for a single portfolio,
 * showing the before/after NAV at each top-up.
 */
export async function getTopupTimeline(req: Request, res: Response) {
  try {
    const { userPortfolioId } = req.params;

    const events = await db.topupEvent.findMany({
      where:   { userPortfolioId },
      orderBy: { createdAt: "asc" },
      include: {
        deposit: { select: { id: true, amount: true, createdAt: true, approvedAt: true } },
        mergedSubPortfolios: {
          orderBy: { generation: "asc" },
          select: { id: true, generation: true, label: true, amountInvested: true, totalCloseValue: true, totalFees: true },
        },
      },
    });

    // Build a running timeline
    const timeline = events.map((e) => ({
      eventId:          e.id,
      topupAmount:      e.topupAmount,
      previousTotal:    e.previousTotal,
      newTotalInvested: e.newTotalInvested,
      newCloseValue:    e.newTotalCloseValue,
      newNAV:           e.newNetAssetValue,
      gainLoss:         e.newTotalLossGain,
      totalFees:        e.newTotalFees,
      status:           e.status,
      mergedAt:         e.mergedAt,
      slices:           e.mergedSubPortfolios,
      depositDate:      e.deposit?.createdAt,
      approvedAt:       e.deposit?.approvedAt,
    }));

    return res.status(200).json({ data: timeline, error: null });
  } catch (err) {
    console.error("getTopupTimeline error:", err);
    return res.status(500).json({ data: null, error: "Failed to fetch top-up timeline" });
  }
}