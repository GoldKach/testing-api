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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyOnboardingApproved = notifyOnboardingApproved;
exports.notifyDepositReceived = notifyDepositReceived;
exports.notifyDepositApproved = notifyDepositApproved;
exports.notifyWithdrawalReceived = notifyWithdrawalReceived;
exports.notifyWithdrawalApproved = notifyWithdrawalApproved;
exports.notifyRedemptionApproved = notifyRedemptionApproved;
exports.notifyPortfolioAllocated = notifyPortfolioAllocated;
exports.notifyStaffRedemptionRequested = notifyStaffRedemptionRequested;
exports.notifyStaffTopupRequested = notifyStaffTopupRequested;
exports.notifySecurityAlert = notifySecurityAlert;
const db_1 = require("../db/db");
const client_1 = require("@prisma/client");
const mailer_1 = require("../lib/mailer");
const APP_URL = (_a = process.env.APP_URL) !== null && _a !== void 0 ? _a : "http://localhost:3000";
const STAFF_NOTIFY_ROLES = [
    client_1.UserRole.SUPER_ADMIN,
    client_1.UserRole.CLIENT_RELATIONS,
    client_1.UserRole.ONBOARDING_OFFICER,
];
const STAFF_DASHBOARD_HOME = {
    [client_1.UserRole.SUPER_ADMIN]: `${APP_URL}/dashboard`,
    [client_1.UserRole.CLIENT_RELATIONS]: `${APP_URL}/cr`,
    [client_1.UserRole.ONBOARDING_OFFICER]: `${APP_URL}/onboarding-officer`,
};
const STAFF_EVENT_PATH = {
    [client_1.NotificationType.REDEMPTION_REQUESTED]: {
        [client_1.UserRole.SUPER_ADMIN]: `${APP_URL}/dashboard/withdrawals`,
        [client_1.UserRole.CLIENT_RELATIONS]: `${APP_URL}/cr/withdrawals`,
    },
    [client_1.NotificationType.TOPUP_REQUESTED]: {
        [client_1.UserRole.SUPER_ADMIN]: `${APP_URL}/dashboard/deposits`,
        [client_1.UserRole.CLIENT_RELATIONS]: `${APP_URL}/cr/deposits`,
    },
};
function money(amount) {
    return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function createNotification(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const { userId, type, title, message, meta, ctaLabel, ctaUrl } = args;
        try {
            yield db_1.db.notification.create({
                data: { userId, type, title, message, meta: meta !== null && meta !== void 0 ? meta : undefined },
            });
        }
        catch (e) {
            console.error(`[notifications] failed to create in-app notification (${type}) for ${userId}:`, e);
        }
        try {
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { email: true, firstName: true, name: true },
            });
            if (!(user === null || user === void 0 ? void 0 : user.email))
                return;
            yield (0, mailer_1.sendNotificationEmail)({
                to: user.email,
                name: user.firstName || user.name || "there",
                subject: title,
                title,
                message,
                ctaLabel,
                ctaUrl,
                category: type.toLowerCase(),
            });
        }
        catch (e) {
            console.error(`[notifications] failed to send email (${type}) for ${userId}:`, e);
        }
    });
}
function notifyOnboardingApproved(userId, isCompany) {
    return createNotification({
        userId,
        type: client_1.NotificationType.ONBOARDING_APPROVED,
        title: "Your account has been approved",
        message: `Great news — your ${isCompany ? "company" : ""} onboarding application has been reviewed and approved by our compliance team. You can now make your first deposit and start investing.`,
        ctaLabel: "Go to my dashboard",
        ctaUrl: `${APP_URL}/user`,
    });
}
function notifyDepositReceived(userId, amount) {
    return createNotification({
        userId,
        type: client_1.NotificationType.DEPOSIT_RECEIVED,
        title: "Deposit received",
        message: `We've received your deposit request of ${money(amount)}. It is now pending approval — we'll notify you as soon as it's processed.`,
        meta: { amount },
        ctaLabel: "View my deposits",
        ctaUrl: `${APP_URL}/user/deposits`,
    });
}
function notifyDepositApproved(userId, amount) {
    return createNotification({
        userId,
        type: client_1.NotificationType.DEPOSIT_APPROVED,
        title: "Deposit approved",
        message: `Your deposit of ${money(amount)} has been approved and credited to your account.`,
        meta: { amount },
        ctaLabel: "View my wallet",
        ctaUrl: `${APP_URL}/user/wallets`,
    });
}
function notifyWithdrawalReceived(userId, amount, isRedemption) {
    return createNotification({
        userId,
        type: client_1.NotificationType.WITHDRAWAL_RECEIVED,
        title: isRedemption ? "Redemption request received" : "Withdrawal request received",
        message: `We've received your ${isRedemption ? "redemption" : "withdrawal"} request of ${money(amount)}. It is now pending approval — we'll notify you as soon as it's processed.`,
        meta: { amount, isRedemption },
        ctaLabel: "View my withdrawals",
        ctaUrl: `${APP_URL}/user/withdraws`,
    });
}
function notifyWithdrawalApproved(userId, amount) {
    return createNotification({
        userId,
        type: client_1.NotificationType.WITHDRAWAL_APPROVED,
        title: "Withdrawal approved",
        message: `Your withdrawal of ${money(amount)} has been approved and processed.`,
        meta: { amount },
        ctaLabel: "View my withdrawals",
        ctaUrl: `${APP_URL}/user/withdraws`,
    });
}
function notifyRedemptionApproved(userId, amount) {
    return createNotification({
        userId,
        type: client_1.NotificationType.REDEMPTION_APPROVED,
        title: "Redemption approved",
        message: `Your redemption of ${money(amount)} has been approved and moved to your master wallet.`,
        meta: { amount },
        ctaLabel: "View my wallet",
        ctaUrl: `${APP_URL}/user/wallets`,
    });
}
function notifyPortfolioAllocated(userId, portfolioName, amount) {
    return createNotification({
        userId,
        type: client_1.NotificationType.PORTFOLIO_ALLOCATED,
        title: "Portfolio allocation created",
        message: `A new portfolio, "${portfolioName}", has been set up for you with an allocation of ${money(amount)}.`,
        meta: { portfolioName, amount },
        ctaLabel: "View my portfolio",
        ctaUrl: `${APP_URL}/user/portfolio`,
    });
}
function notifyStaff(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const staff = yield db_1.db.user.findMany({
            where: { role: { in: STAFF_NOTIFY_ROLES } },
            select: { id: true, role: true },
        });
        const eventPaths = STAFF_EVENT_PATH[args.type];
        yield Promise.all(staff.map((s) => {
            var _a;
            return createNotification({
                userId: s.id,
                type: args.type,
                title: args.title,
                message: args.message,
                meta: args.meta,
                ctaLabel: args.ctaLabel,
                ctaUrl: (_a = eventPaths === null || eventPaths === void 0 ? void 0 : eventPaths[s.role]) !== null && _a !== void 0 ? _a : STAFF_DASHBOARD_HOME[s.role],
            });
        }));
    });
}
function clientDisplayName(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield db_1.db.user.findUnique({ where: { id: userId }, select: { name: true, firstName: true, lastName: true } });
        return (user === null || user === void 0 ? void 0 : user.name) || [user === null || user === void 0 ? void 0 : user.firstName, user === null || user === void 0 ? void 0 : user.lastName].filter(Boolean).join(" ") || "A client";
    });
}
function notifyStaffRedemptionRequested(clientUserId, amount) {
    return __awaiter(this, void 0, void 0, function* () {
        const name = yield clientDisplayName(clientUserId);
        return notifyStaff({
            type: client_1.NotificationType.REDEMPTION_REQUESTED,
            title: "New redemption request",
            message: `${name} submitted a redemption request of ${money(amount)}, pending your review.`,
            meta: { clientUserId, amount },
            ctaLabel: "Review withdrawals",
        });
    });
}
function notifyStaffTopupRequested(clientUserId, amount) {
    return __awaiter(this, void 0, void 0, function* () {
        const name = yield clientDisplayName(clientUserId);
        return notifyStaff({
            type: client_1.NotificationType.TOPUP_REQUESTED,
            title: "New top-up request",
            message: `${name} submitted a portfolio top-up of ${money(amount)}, pending your review.`,
            meta: { clientUserId, amount },
            ctaLabel: "Review deposits",
        });
    });
}
function notifySecurityAlert(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const { eventType, riskLevel, description, userEmail, metadata } = params;
        const isBruteForce = eventType === "BRUTE_FORCE_DETECTED";
        const title = isBruteForce ? "Multiple failed login attempts detected" : "Suspicious activity detected";
        const message = isBruteForce
            ? `Repeated failed login attempts were detected${userEmail ? ` for ${userEmail}` : ""}. ${description !== null && description !== void 0 ? description : ""}`.trim()
            : (description !== null && description !== void 0 ? description : `A ${riskLevel.toLowerCase()}-risk security event (${eventType}) was detected.`);
        return notifyStaff({
            type: client_1.NotificationType.SECURITY_ALERT,
            title,
            message,
            meta: Object.assign({ eventType, riskLevel, userEmail }, metadata),
            ctaLabel: "Review security activity",
        });
    });
}
