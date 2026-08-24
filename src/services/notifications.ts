// src/services/notifications.ts
import { db } from "@/db/db";
import { NotificationType, UserRole } from "@prisma/client";
import { sendNotificationEmail } from "@/lib/mailer";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const STAFF_NOTIFY_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.CLIENT_RELATIONS,
  UserRole.ONBOARDING_OFFICER,
];

/** Each staff role's dashboard home — used as the email CTA fallback. */
const STAFF_DASHBOARD_HOME: Partial<Record<UserRole, string>> = {
  [UserRole.SUPER_ADMIN]: `${APP_URL}/dashboard`,
  [UserRole.CLIENT_RELATIONS]: `${APP_URL}/cr`,
  [UserRole.ONBOARDING_OFFICER]: `${APP_URL}/onboarding-officer`,
};

/** Per-event, per-role deep link — falls back to that role's dashboard home when no specific page exists. */
const STAFF_EVENT_PATH: Partial<Record<NotificationType, Partial<Record<UserRole, string>>>> = {
  [NotificationType.REDEMPTION_REQUESTED]: {
    [UserRole.SUPER_ADMIN]: `${APP_URL}/dashboard/withdrawals`,
    [UserRole.CLIENT_RELATIONS]: `${APP_URL}/cr/withdrawals`,
  },
  [NotificationType.TOPUP_REQUESTED]: {
    [UserRole.SUPER_ADMIN]: `${APP_URL}/dashboard/deposits`,
    [UserRole.CLIENT_RELATIONS]: `${APP_URL}/cr/deposits`,
  },
};

function money(amount: number) {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Creates an in-app Notification row and best-effort sends the matching
 * email. Never throws — a failed lookup or a Resend outage is logged and
 * swallowed so it can never break the caller's business transaction.
 */
async function createNotification(args: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  meta?: Record<string, any>;
  ctaLabel?: string;
  ctaUrl?: string;
}): Promise<void> {
  const { userId, type, title, message, meta, ctaLabel, ctaUrl } = args;

  try {
    await db.notification.create({
      data: { userId, type, title, message, meta: meta ?? undefined },
    });
  } catch (e) {
    console.error(`[notifications] failed to create in-app notification (${type}) for ${userId}:`, e);
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, name: true },
    });
    if (!user?.email) return;

    await sendNotificationEmail({
      to: user.email,
      name: user.firstName || user.name || "there",
      subject: title,
      title,
      message,
      ctaLabel,
      ctaUrl,
      category: type.toLowerCase(),
    });
  } catch (e) {
    console.error(`[notifications] failed to send email (${type}) for ${userId}:`, e);
  }
}

export function notifyOnboardingApproved(userId: string, isCompany: boolean) {
  return createNotification({
    userId,
    type: NotificationType.ONBOARDING_APPROVED,
    title: "Your account has been approved",
    message: `Great news — your ${isCompany ? "company" : ""} onboarding application has been reviewed and approved by our compliance team. You can now make your first deposit and start investing.`,
    ctaLabel: "Go to my dashboard",
    ctaUrl: `${APP_URL}/user`,
  });
}

export function notifyDepositReceived(userId: string, amount: number) {
  return createNotification({
    userId,
    type: NotificationType.DEPOSIT_RECEIVED,
    title: "Deposit received",
    message: `We've received your deposit request of ${money(amount)}. It is now pending approval — we'll notify you as soon as it's processed.`,
    meta: { amount },
    ctaLabel: "View my deposits",
    ctaUrl: `${APP_URL}/user/deposits`,
  });
}

export function notifyDepositApproved(userId: string, amount: number) {
  return createNotification({
    userId,
    type: NotificationType.DEPOSIT_APPROVED,
    title: "Deposit approved",
    message: `Your deposit of ${money(amount)} has been approved and credited to your account.`,
    meta: { amount },
    ctaLabel: "View my wallet",
    ctaUrl: `${APP_URL}/user/wallets`,
  });
}

export function notifyWithdrawalReceived(userId: string, amount: number, isRedemption: boolean) {
  return createNotification({
    userId,
    type: NotificationType.WITHDRAWAL_RECEIVED,
    title: isRedemption ? "Redemption request received" : "Withdrawal request received",
    message: `We've received your ${isRedemption ? "redemption" : "withdrawal"} request of ${money(amount)}. It is now pending approval — we'll notify you as soon as it's processed.`,
    meta: { amount, isRedemption },
    ctaLabel: "View my withdrawals",
    ctaUrl: `${APP_URL}/user/withdraws`,
  });
}

export function notifyWithdrawalApproved(userId: string, amount: number) {
  return createNotification({
    userId,
    type: NotificationType.WITHDRAWAL_APPROVED,
    title: "Withdrawal approved",
    message: `Your withdrawal of ${money(amount)} has been approved and processed.`,
    meta: { amount },
    ctaLabel: "View my withdrawals",
    ctaUrl: `${APP_URL}/user/withdraws`,
  });
}

export function notifyRedemptionApproved(userId: string, amount: number) {
  return createNotification({
    userId,
    type: NotificationType.REDEMPTION_APPROVED,
    title: "Redemption approved",
    message: `Your redemption of ${money(amount)} has been approved and moved to your master wallet.`,
    meta: { amount },
    ctaLabel: "View my wallet",
    ctaUrl: `${APP_URL}/user/wallets`,
  });
}

export function notifyPortfolioAllocated(userId: string, portfolioName: string, amount: number) {
  return createNotification({
    userId,
    type: NotificationType.PORTFOLIO_ALLOCATED,
    title: "Portfolio allocation created",
    message: `A new portfolio, "${portfolioName}", has been set up for you with an allocation of ${money(amount)}.`,
    meta: { portfolioName, amount },
    ctaLabel: "View my portfolio",
    ctaUrl: `${APP_URL}/user/portfolio`,
  });
}

/* ------------------------------------------------------------------ */
/*  Staff notifications — broadcast to Super Admin, CR, Onboarding     */
/*  Officer whenever a client submits something needing review, or the */
/*  audit service flags high-risk security activity.                   */
/* ------------------------------------------------------------------ */

async function notifyStaff(args: {
  type: NotificationType;
  title: string;
  message: string;
  meta?: Record<string, any>;
  ctaLabel?: string;
}): Promise<void> {
  const staff = await db.user.findMany({
    where: { role: { in: STAFF_NOTIFY_ROLES } },
    select: { id: true, role: true },
  });

  const eventPaths = STAFF_EVENT_PATH[args.type];

  await Promise.all(
    staff.map((s) =>
      createNotification({
        userId: s.id,
        type: args.type,
        title: args.title,
        message: args.message,
        meta: args.meta,
        ctaLabel: args.ctaLabel,
        ctaUrl: eventPaths?.[s.role] ?? STAFF_DASHBOARD_HOME[s.role],
      })
    )
  );
}

async function clientDisplayName(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, firstName: true, lastName: true } });
  return user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "A client";
}

export async function notifyStaffRedemptionRequested(clientUserId: string, amount: number) {
  const name = await clientDisplayName(clientUserId);
  return notifyStaff({
    type: NotificationType.REDEMPTION_REQUESTED,
    title: "New redemption request",
    message: `${name} submitted a redemption request of ${money(amount)}, pending your review.`,
    meta: { clientUserId, amount },
    ctaLabel: "Review withdrawals",
  });
}

export async function notifyStaffTopupRequested(clientUserId: string, amount: number) {
  const name = await clientDisplayName(clientUserId);
  return notifyStaff({
    type: NotificationType.TOPUP_REQUESTED,
    title: "New top-up request",
    message: `${name} submitted a portfolio top-up of ${money(amount)}, pending your review.`,
    meta: { clientUserId, amount },
    ctaLabel: "Review deposits",
  });
}

export async function notifySecurityAlert(params: {
  eventType: string;
  riskLevel: string;
  description?: string | null;
  userEmail?: string | null;
  metadata?: Record<string, any>;
}) {
  const { eventType, riskLevel, description, userEmail, metadata } = params;

  const isBruteForce = eventType === "BRUTE_FORCE_DETECTED";
  const title = isBruteForce ? "Multiple failed login attempts detected" : "Suspicious activity detected";
  const message = isBruteForce
    ? `Repeated failed login attempts were detected${userEmail ? ` for ${userEmail}` : ""}. ${description ?? ""}`.trim()
    : (description ?? `A ${riskLevel.toLowerCase()}-risk security event (${eventType}) was detected.`);

  return notifyStaff({
    type: NotificationType.SECURITY_ALERT,
    title,
    message,
    meta: { eventType, riskLevel, userEmail, ...metadata },
    ctaLabel: "Review security activity",
  });
}
