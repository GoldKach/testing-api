import type { Request, Response } from "express";
import { db } from "@/db/db";
import type { AuthRequest } from "@/utils/auth";

// ─── Shared select ────────────────────────────────────────────────────────────

const SESSION_SELECT = {
  id:         true,
  createdAt:  true,
  expiresAt:  true,
  revoked:    true,
  revokedAt:  true,
  ipAddress:  true,
  userAgent:  true,
  location:   true,
  country:    true,
  city:       true,
  deviceType: true,
  browser:    true,
  os:         true,
  user: {
    select: {
      id:        true,
      firstName: true,
      lastName:  true,
      email:     true,
      role:      true,
      status:    true,
      imageUrl:  true,
    },
  },
} as const;

function isExpired(expiresAt: Date) {
  return new Date() > expiresAt;
}

// ─── GET /sessions ─────────────────────────────────────────────────────────────
// All sessions — active first, then revoked/expired. Paginated.
export async function listAllSessions(req: Request, res: Response) {
  try {
    const {
      page     = "1",
      pageSize = "50",
      userId,
      active,    // "true" = only non-revoked, non-expired
      search,
    } = req.query as Record<string, string | undefined>;

    const take = Math.min(Number(pageSize) || 50, 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (userId) where.userId = userId;

    if (active === "true") {
      where.revoked  = false;
      where.expiresAt = { gt: new Date() };
    }

    if (search) {
      where.OR = [
        { ipAddress: { contains: search, mode: "insensitive" } },
        { location:  { contains: search, mode: "insensitive" } },
        { browser:   { contains: search, mode: "insensitive" } },
        { os:        { contains: search, mode: "insensitive" } },
        { user: { email:     { contains: search, mode: "insensitive" } } },
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName:  { contains: search, mode: "insensitive" } } },
      ];
    }

    const [total, rows] = await Promise.all([
      db.refreshToken.count({ where }),
      db.refreshToken.findMany({
        where,
        select:  SESSION_SELECT,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    const enriched = rows.map((s) => ({
      ...s,
      isExpired: isExpired(s.expiresAt),
      isActive:  !s.revoked && !isExpired(s.expiresAt),
    }));

    return res.json({
      data: { rows: enriched, total, page: Number(page), pageSize: take, totalPages: Math.ceil(total / take) },
      error: null,
    });
  } catch (err) {
    console.error("listAllSessions error:", err);
    return res.status(500).json({ data: null, error: "Failed to list sessions" });
  }
}

// ─── GET /users/:userId/sessions ──────────────────────────────────────────────
export async function listUserSessions(req: Request, res: Response) {
  const { userId } = req.params;
  try {
    const rows = await db.refreshToken.findMany({
      where:   { userId },
      select:  SESSION_SELECT,
      orderBy: { createdAt: "desc" },
      take:    50,
    });

    const enriched = rows.map((s) => ({
      ...s,
      isExpired: isExpired(s.expiresAt),
      isActive:  !s.revoked && !isExpired(s.expiresAt),
    }));

    return res.json({ data: enriched, error: null });
  } catch (err) {
    console.error("listUserSessions error:", err);
    return res.status(500).json({ data: null, error: "Failed to list user sessions" });
  }
}

// ─── DELETE /sessions/:id — revoke a single session ──────────────────────────
export async function revokeSession(req: AuthRequest, res: Response) {
  const { id } = req.params;
  try {
    const session = await db.refreshToken.findUnique({ where: { id }, select: { id: true, revoked: true } });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.revoked) return res.json({ ok: true, message: "Already revoked" });

    await db.refreshToken.update({
      where: { id },
      data:  { revoked: true, revokedAt: new Date() },
    });

    return res.json({ ok: true, message: "Session revoked" });
  } catch (err) {
    console.error("revokeSession error:", err);
    return res.status(500).json({ error: "Failed to revoke session" });
  }
}

// ─── DELETE /users/:userId/sessions — revoke all sessions for a user ──────────
export async function revokeAllUserSessions(req: AuthRequest, res: Response) {
  const { userId } = req.params;
  try {
    const { count } = await db.refreshToken.updateMany({
      where: { userId, revoked: false },
      data:  { revoked: true, revokedAt: new Date() },
    });

    return res.json({ ok: true, revokedCount: count });
  } catch (err) {
    console.error("revokeAllUserSessions error:", err);
    return res.status(500).json({ error: "Failed to revoke sessions" });
  }
}

// ─── GET /sessions/stats ──────────────────────────────────────────────────────
// Platform-wide session statistics for the dashboard widget.
export async function getSessionStats(req: Request, res: Response) {
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);

    const [total, active, last24h, last7d, byCountry, byDevice] = await Promise.all([
      db.refreshToken.count(),
      db.refreshToken.count({ where: { revoked: false, expiresAt: { gt: now } } }),
      db.refreshToken.count({ where: { createdAt: { gte: since24h } } }),
      db.refreshToken.count({ where: { createdAt: { gte: since7d  } } }),
      // Top countries (raw group-by via findMany + JS reduce)
      db.refreshToken.findMany({
        where:  { country: { not: null } },
        select: { country: true },
        take:   2000,
      }),
      db.refreshToken.findMany({
        where:  { deviceType: { not: null } },
        select: { deviceType: true },
        take:   2000,
      }),
    ]);

    const countryMap: Record<string, number> = {};
    for (const r of byCountry) if (r.country) countryMap[r.country] = (countryMap[r.country] ?? 0) + 1;
    const topCountries = Object.entries(countryMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([country, count]) => ({ country, count }));

    const deviceMap: Record<string, number> = {};
    for (const r of byDevice) if (r.deviceType) deviceMap[r.deviceType] = (deviceMap[r.deviceType] ?? 0) + 1;
    const byDeviceType = Object.entries(deviceMap).map(([type, count]) => ({ type, count }));

    return res.json({ data: { total, active, last24h, last7d, topCountries, byDeviceType }, error: null });
  } catch (err) {
    console.error("getSessionStats error:", err);
    return res.status(500).json({ data: null, error: "Failed to get session stats" });
  }
}
