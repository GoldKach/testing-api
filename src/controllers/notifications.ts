// src/controllers/notifications.ts
import { Request, Response } from "express";
import { db } from "@/db/db";

function getUserId(req: Request): string | undefined {
  return (req as any)?.user?.userId;
}

// ---------------------------------------------------------------------------
// GET /notifications?take=20&skip=0
// Returns the authenticated user's own notifications, newest first.
// ---------------------------------------------------------------------------
export async function listNotifications(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated." });

    const take = Math.min(Math.max(Number(req.query.take) || 20, 1), 100);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    const [items, total] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      db.notification.count({ where: { userId } }),
    ]);

    return res.status(200).json({ ok: true, data: items, total });
  } catch (e) {
    console.error("listNotifications error:", e);
    return res.status(500).json({ error: "Failed to load notifications." });
  }
}

// ---------------------------------------------------------------------------
// GET /notifications/unread-count
// ---------------------------------------------------------------------------
export async function getUnreadNotificationCount(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated." });

    const count = await db.notification.count({ where: { userId, isRead: false } });
    return res.status(200).json({ ok: true, data: { count } });
  } catch (e) {
    console.error("getUnreadNotificationCount error:", e);
    return res.status(500).json({ error: "Failed to load unread count." });
  }
}

// ---------------------------------------------------------------------------
// PATCH /notifications/:id/read
// ---------------------------------------------------------------------------
export async function markNotificationRead(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated." });

    const { id } = req.params;
    const existing = await db.notification.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Notification not found." });
    }

    const updated = await db.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error("markNotificationRead error:", e);
    return res.status(500).json({ error: "Failed to update notification." });
  }
}

// ---------------------------------------------------------------------------
// PATCH /notifications/read-all
// ---------------------------------------------------------------------------
export async function markAllNotificationsRead(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated." });

    await db.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("markAllNotificationsRead error:", e);
    return res.status(500).json({ error: "Failed to update notifications." });
  }
}
