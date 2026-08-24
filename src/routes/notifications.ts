// src/routes/notifications.ts
import { Router } from "express";
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/controllers/notifications";
import { authenticateToken } from "@/utils/auth";

const notificationsRouter = Router();

notificationsRouter.get("/notifications", authenticateToken, listNotifications);
notificationsRouter.get("/notifications/unread-count", authenticateToken, getUnreadNotificationCount);
notificationsRouter.patch("/notifications/read-all", authenticateToken, markAllNotificationsRead);
notificationsRouter.patch("/notifications/:id/read", authenticateToken, markNotificationRead);

export default notificationsRouter;
