"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listNotifications = listNotifications;
exports.getUnreadNotificationCount = getUnreadNotificationCount;
exports.markNotificationRead = markNotificationRead;
exports.markAllNotificationsRead = markAllNotificationsRead;
const db_1 = require("../db/db");
function getUserId(req) {
    var _a;
    return (_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.userId;
}
function listNotifications(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated." });
            const take = Math.min(Math.max(Number(req.query.take) || 20, 1), 100);
            const skip = Math.max(Number(req.query.skip) || 0, 0);
            const [items, total] = yield Promise.all([
                db_1.db.notification.findMany({
                    where: { userId },
                    orderBy: { createdAt: "desc" },
                    take,
                    skip,
                }),
                db_1.db.notification.count({ where: { userId } }),
            ]);
            return res.status(200).json({ ok: true, data: items, total });
        }
        catch (e) {
            console.error("listNotifications error:", e);
            return res.status(500).json({ error: "Failed to load notifications." });
        }
    });
}
function getUnreadNotificationCount(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated." });
            const count = yield db_1.db.notification.count({ where: { userId, isRead: false } });
            return res.status(200).json({ ok: true, data: { count } });
        }
        catch (e) {
            console.error("getUnreadNotificationCount error:", e);
            return res.status(500).json({ error: "Failed to load unread count." });
        }
    });
}
function markNotificationRead(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated." });
            const { id } = req.params;
            const existing = yield db_1.db.notification.findUnique({ where: { id }, select: { id: true, userId: true } });
            if (!existing || existing.userId !== userId) {
                return res.status(404).json({ error: "Notification not found." });
            }
            const updated = yield db_1.db.notification.update({
                where: { id },
                data: { isRead: true, readAt: new Date() },
            });
            return res.status(200).json({ ok: true, data: updated });
        }
        catch (e) {
            console.error("markNotificationRead error:", e);
            return res.status(500).json({ error: "Failed to update notification." });
        }
    });
}
function markAllNotificationsRead(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated." });
            yield db_1.db.notification.updateMany({
                where: { userId, isRead: false },
                data: { isRead: true, readAt: new Date() },
            });
            return res.status(200).json({ ok: true });
        }
        catch (e) {
            console.error("markAllNotificationsRead error:", e);
            return res.status(500).json({ error: "Failed to update notifications." });
        }
    });
}
