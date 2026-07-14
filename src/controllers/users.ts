// src/controllers/users.ts
import { db } from "@/db/db";
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto, { randomInt } from "crypto";
import PDFDocument from "pdfkit";
import {
  generateAccessToken,
  generateRefreshToken,
  TokenPayload,
} from "@/utils/tokens";
import { AuthRequest } from "@/utils/auth";
import { parseUserAgent } from "@/utils/userAgentParser";
import { lookupIp } from "@/utils/geoLocation";
import { UserRole, UserStatus } from "@prisma/client";
import { sendAccountVerifiedEmail, sendVerificationCodeResend } from "@/lib/mailer";
import { verifyRecaptcha } from "@/utils/recaptcha";

/* --------------------------------- helpers --------------------------------- */

function generateAccountNumber(): string {
  return `GK${randomInt(1_000_000, 10_000_000)}`;
}

const isValidRole   = (v: any): v is UserRole   => Object.values(UserRole).includes(v as UserRole);
const isValidStatus = (v: any): v is UserStatus => Object.values(UserStatus).includes(v as UserStatus);
const makeSixDigitToken = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

// ─── Shared select for UserPortfolio ─────────────────────────────────────────
const userPortfolioSelect = {
  id:             true,
  customName:     true,
  portfolioValue: true,
  totalInvested:  true,
  totalLossGain:  true,
  isActive:       true,
  portfolio:      true,
  // PortfolioWallet (one per UserPortfolio — new schema)
  wallet: {
    select: {
      id:             true,
      accountNumber:  true,
      balance:        true,
      netAssetValue:  true,
      totalFees:      true,
      bankFee:        true,
      transactionFee: true,
      feeAtBank:      true,
      status:         true,
    },
  },
  userAssets: {
    select: {
      id:                   true,
      allocationPercentage: true,
      costPerShare:         true,
      costPrice:            true,
      stock:                true,
      closeValue:           true,
      lossGain:             true,
      asset:                true,
    },
  },
};

// ─── Shared select for user detail responses ──────────────────────────────────
const userDetailSelect = {
  id:            true,
  firstName:     true,
  lastName:      true,
  name:          true,
  email:         true,
  phone:         true,
  emailVerified: true,
  status:        true,
  isApproved:    true,
  imageUrl:      true,
  role:          true,
  createdAt:     true,
  updatedAt:     true,

  // ── Onboarding (full data needed for KYC PDF generation) ────────────────────
  individualOnboarding: {
    include: {
      beneficiaries: true,
      nextOfKin:     true,
    },
  },
  companyOnboarding: {
    include: {
      directors: true,
      ubos:      true,
    },
  },

  // ── Master wallet (one per user — new schema) ─────────────────────────────
  masterWallet: {
    select: {
      id:             true,
      accountNumber:  true,
      balance:        true,
      totalDeposited: true,
      totalWithdrawn: true,
      totalFees:      true,
      netAssetValue:  true,
      status:         true,
      updatedAt:      true,
    },
  },

  deposits: {
    orderBy: { createdAt: "desc" as const },
    take:    20,
    select: {
      id:                true,
      amount:            true,
      transactionStatus: true,
      depositTarget:     true,
      userPortfolioId:   true,
      transactionId:     true,
      referenceNo:       true,
      mobileNo:          true,
      accountNo:         true,
      method:            true,
      description:       true,
      createdByName:     true,
      approvedByName:    true,
      approvedAt:        true,
      rejectedByName:    true,
      rejectedAt:        true,
      rejectReason:      true,
      createdAt:         true,
      bankCost:          true,
      transactionCost:   true,
      cashAtBank:        true,
    },
  },
  withdrawals: {
    orderBy: { createdAt: "desc" as const },
    take:    20,
    select: {
      id:                true,
      amount:            true,
      transactionStatus: true,
      userPortfolioId:   true,
      withdrawalType:    true,
      transactionId:     true,
      referenceNo:       true,
      accountNo:         true,
      accountName:       true,
      method:            true,
      bankName:          true,
      bankAccountName:   true,
      bankBranch:        true,
      description:       true,
      createdByName:     true,
      approvedByName:    true,
      approvedAt:        true,
      rejectedByName:    true,
      rejectedAt:        true,
      rejectReason:      true,
      createdAt:         true,
    },
  },
  userPortfolios: { select: userPortfolioSelect },

  // ── Signature (for KYC PDF) ───────────────────────────────────────────────
  signature: {
    select: {
      signatureType: true,
      imageUrl:      true,
      typedName:     true,
      signedAt:      true,
    },
  },
};

/* ============================
   CREATE USER
============================= */
export async function createUser(req: Request, res: Response) {
  const {
    email, phone, password, firstName, lastName,
    imageUrl, role, status,
    recaptchaToken,
    website,    // honeypot
    entityType,
  } = req.body as {
    email: string; phone: string; password: string;
    firstName: string; lastName?: string; imageUrl?: string;
    role?: UserRole | string; status?: UserStatus | string;
    recaptchaToken?: string; website?: string;
    entityType?: "individual" | "company";
  };

  try {
    // 🍯 Honeypot
    if (website?.trim()) {
      console.log("🍯 Honeypot triggered:", { email, ip: req.ip, ua: req.headers["user-agent"] });
      return res.status(201).json({
        success: true, data: null,
        message: "Account created successfully. Please check your email for the verification code.",
        errors: {},
      });
    }

    // 🔐 reCAPTCHA
    if (!recaptchaToken?.trim()) {
      return res.status(400).json({
        success: false, data: null,
        message: "reCAPTCHA verification is required",
        errors: { recaptcha: "Please complete the reCAPTCHA verification" },
      });
    }
    const recaptchaResult = await verifyRecaptcha(recaptchaToken);
    if (!recaptchaResult.success) {
      return res.status(400).json({
        success: false, data: null,
        message: recaptchaResult.error || "reCAPTCHA verification failed",
        errors: { recaptcha: recaptchaResult.error || "Verification failed. Please try again." },
      });
    }

    // Basic validation — lastName optional (empty for company registrations)
    if (!email || !phone || !password || !firstName) {
      return res.status(400).json({
        success: false, data: null,
        message: "Missing required fields.",
        errors: {},
      });
    }

    const emailNorm   = email.trim().toLowerCase();
    const phoneNorm   = phone.trim();
    const roleValue   = isValidRole(role)     ? (role as UserRole)     : UserRole.USER;
    const statusValue = isValidStatus(status) ? (status as UserStatus) : UserStatus.PENDING;

    // Build display name — company uses firstName only; individual uses firstName + lastName
    const displayName = lastName?.trim()
      ? `${firstName.trim()} ${lastName.trim()}`
      : firstName.trim();

    // Duplicate checks
    const [existingEmail, existingPhone] = await Promise.all([
      db.user.findUnique({ where: { email: emailNorm }, select: { id: true } }),
      db.user.findUnique({ where: { phone: phoneNorm }, select: { id: true } }),
    ]);

    if (existingEmail && existingPhone) {
      return res.status(409).json({
        success: false, data: null,
        message: "Account already exists.",
        errors: { email: "Email already registered", phone: "Phone already registered" },
      });
    }
    if (existingEmail) {
      return res.status(409).json({
        success: false, data: null,
        message: "Email address is already registered.",
        errors: { email: "Email address is already registered" },
      });
    }
    if (existingPhone) {
      return res.status(409).json({
        success: false, data: null,
        message: "Phone number is already registered.",
        errors: { phone: "Phone number is already registered" },
      });
    }

    const hashedPassword   = await bcrypt.hash(password, 12);
    const verificationCode = makeSixDigitToken();

    // MasterWallet — no pre-set fees; fees are recorded at first deposit approval
    const totalFees = 0;

    let newUser: {
      id: string;
      firstName: string;
      lastName: string | null;
      name: string;
      email: string;
      phone: string;
      imageUrl: string;
      role: UserRole;
      status: UserStatus;
      createdAt: Date;
      updatedAt: Date;
    } | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        newUser = await db.$transaction(async (tx) => {
          const accountNumber = generateAccountNumber();

          const user = await tx.user.create({
            data: {
              email:         emailNorm,
              phone:         phoneNorm,
              firstName:     firstName.trim(),
              lastName:      lastName?.trim() || "",
              name:          displayName,
              imageUrl,
              password:      hashedPassword,
              role:          roleValue,
              status:        statusValue,
              emailVerified: false,
              isApproved:    false,
              token:         verificationCode,

              // Create the master wallet — no portfolio wallets yet
              masterWallet: {
                create: {
                  accountNumber,
                  totalDeposited: 0,
                  totalWithdrawn: 0,
                  totalFees,
                  netAssetValue:  0,
                  status:         "ACTIVE",
                },
              },
            },
            select: {
              id: true, firstName: true, lastName: true, name: true,
              email: true, phone: true, imageUrl: true,
              role: true, status: true, createdAt: true, updatedAt: true,
            },
          });

          return user;
        });
        break;
      } catch (err: any) {
        if (err?.code === "P2002" && attempt < 2) continue;
        throw err;
      }
    }

    if (!newUser) {
      return res.status(500).json({
        success: false, data: null,
        message: "Failed to create user.",
        errors: {},
      });
    }

    try {
      await sendVerificationCodeResend({
        to:   newUser.email,
        name: newUser.firstName ?? newUser.name ?? "there",
        code: verificationCode,
      });
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
    }

    console.log("✅ User registered:", {
      userId: newUser.id,
      email:  newUser.email,
      entityType: entityType ?? "individual",
      ip: req.ip,
    });

    return res.status(201).json({
      success: true, data: newUser,
      message: "Account created successfully. Please check your email for the verification code.",
      errors: {},
    });
  } catch (error: any) {
    console.error("Error creating user:", error);
    if (error?.code === "P2002") {
      const target = error?.meta?.target as string[] | undefined;
      if (target?.includes("email") && target?.includes("phone")) {
        return res.status(409).json({ success: false, data: null, message: "Account already exists.", errors: { email: "Email already registered", phone: "Phone already registered" } });
      }
      if (target?.includes("email")) {
        return res.status(409).json({ success: false, data: null, message: "Email already registered.", errors: { email: "Email already registered" } });
      }
      if (target?.includes("phone")) {
        return res.status(409).json({ success: false, data: null, message: "Phone already registered.", errors: { phone: "Phone already registered" } });
      }
      return res.status(409).json({ success: false, data: null, message: "Email or phone already in use", errors: {} });
    }
    return res.status(500).json({
      success: false, data: null,
      message: "Something went wrong. Please try again.",
      errors: {},
    });
  }
}

/* ============================
   LOGIN USER
============================= */
export async function loginUser(req: AuthRequest, res: Response) {
  const { identifier, password } = req.body as { identifier: string; password: string };

  try {
    if (!identifier || !password) {
      return res.status(400).json({ data: null, error: "Missing credentials" });
    }

    const idNorm = identifier.trim().toLowerCase();
    const user   = await db.user.findFirst({
      where: { OR: [{ email: idNorm }, { phone: identifier.trim() }] },
    });

    if (!user)                    return res.status(401).json({ data: null, error: "Invalid credentials" });
    if (user.status !== "ACTIVE") return res.status(403).json({ data: null, error: "User account is not active" });
    if (!user.password)           return res.status(401).json({ data: null, error: "This account has no password. Use social login or reset password." });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ data: null, error: "Invalid credentials" });

    const payload: TokenPayload = { userId: user.id, phone: user.phone, email: user.email, role: user.role };
    const accessToken  = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const auditCtx  = req.auditContext;
    const ip        = auditCtx?.ipAddress ?? null;
    const ua        = auditCtx?.userAgent ?? null;
    const uaParsed  = parseUserAgent(ua);
    const geo       = await lookupIp(ip).catch(() => null);

    await db.refreshToken.create({
      data: {
        token:      refreshToken,
        userId:     user.id,
        expiresAt:  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress:  ip,
        userAgent:  ua,
        location:   geo?.location ?? null,
        country:    geo?.country  ?? null,
        city:       geo?.city     ?? null,
        deviceType: uaParsed.deviceType,
        browser:    uaParsed.browser,
        os:         uaParsed.os,
      },
    });

    const { password: _pw, ...safe } = user;
    return res.status(200).json({ data: { user: safe, accessToken, refreshToken }, error: null });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ data: null, error: "An error occurred during login" });
  }
}

/* ============================
   GET ALL USERS
============================= */
export async function getAllUsers(req: AuthRequest, res: Response) {
  try {
    const { role } = req.query as { role?: string };

    const where = role && isValidRole(role) ? { role: role as UserRole } : {};

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        ...userDetailSelect,
        accounts:     true,
        activityLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    return res.status(200).json({ data: users, error: null });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch users" });
  }
}

/* ============================
   GET CURRENT USER
============================= */
export async function getCurrentUser(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ data: null, error: "Unauthorized" });
    }

    const user = await db.user.findUnique({
      where:  { id: req.user.userId },
      select: userDetailSelect,
    });

    if (!user) return res.status(404).json({ data: null, error: "User not found" });
    return res.status(200).json({ data: user, error: null });
  } catch (error) {
    console.error("Error fetching current user:", error);
    return res.status(500).json({ data: null, error: "Server error" });
  }
}

/* ============================
   GET USER BY ID
============================= */
export async function getUserById(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const user = await db.user.findUnique({
      where: { id },
      select: {
        ...userDetailSelect,
        // Full onboarding data for detail view
        individualOnboarding: {
          include: {
            beneficiaries: true,
            nextOfKin: true,
          },
        },
        companyOnboarding: {
          include: {
            directors: true,
            ubos: true,
          },
        },
        // Signature record for agreement regeneration
        signature: {
          select: {
            signatureType: true,
            imageUrl: true,
            typedName: true,
            signedAt: true,
          },
        },
      },
    });

    if (!user) return res.status(404).json({ data: null, error: "User not found" });
    return res.status(200).json({ data: user, error: null });
  } catch (error) {
    console.error("Error fetching user by id:", error);
    return res.status(500).json({ data: null, error: "Server error" });
  }
}

/* ============================
   PATCH SIGNED AGREEMENT URL
============================= */
export async function updateSignedAgreementUrl(req: Request, res: Response) {
  const { id } = req.params;
  const { signedAgreementUrl } = req.body as { signedAgreementUrl?: string };
  if (!signedAgreementUrl) {
    return res.status(400).json({ error: "signedAgreementUrl is required" });
  }
  try {
    const updated = await db.individualOnboarding.updateMany({
      where: { userId: id },
      data: { signedAgreementUrl },
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: "No individual onboarding found for this user" });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("updateSignedAgreementUrl error:", error);
    return res.status(500).json({ error: "Failed to update signed agreement URL" });
  }
}

/* ============================
   UPDATE USER
============================= */
export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  const {
    firstName, lastName, email, phone,
    role, status, password, imageUrl,
    emailVerified, isApproved,
  } = req.body as {
    firstName?: string; lastName?: string;
    email?: string; phone?: string;
    role?: UserRole | string; status?: UserStatus | string;
    password?: string; imageUrl?: string;
    emailVerified?: boolean; isApproved?: boolean;
  };

  try {
    const existingUser = await db.user.findUnique({ where: { id } });
    if (!existingUser) return res.status(404).json({ data: null, error: "User not found" });

    if (email || phone) {
      const conflict = await db.user.findFirst({
        where: {
          OR: [
            { email: email?.trim().toLowerCase() },
            { phone: phone?.trim() },
          ],
          NOT: { id },
        },
        select: { id: true },
      });
      if (conflict) {
        return res.status(409).json({ data: null, error: "Email or phone already in use by another user" });
      }
    }

    const roleValue      = isValidRole(role)     ? (role as UserRole)     : existingUser.role;
    const statusValue    = isValidStatus(status)  ? (status as UserStatus) : existingUser.status;
    const hashedPassword = password ? await bcrypt.hash(password, 12) : undefined;
    const nextFirst      = firstName?.trim() ?? existingUser.firstName;
    const nextLast       = lastName !== undefined
      ? (lastName?.trim() ?? "")
      : (existingUser.lastName ?? "");
    const nextName       = nextLast
      ? `${nextFirst} ${nextLast}`.trim()
      : nextFirst;

    const updatedUser = await db.user.update({
      where: { id },
      data: {
        firstName:     nextFirst,
        lastName:      nextLast,
        name:          nextName,
        email:         email  ? email.trim().toLowerCase() : existingUser.email,
        phone:         phone  ? phone.trim()               : existingUser.phone,
        role:          roleValue,
        status:        statusValue,
        password:      hashedPassword ?? existingUser.password,
        imageUrl:      imageUrl       ?? existingUser.imageUrl,
        emailVerified: emailVerified  ?? existingUser.emailVerified,
        isApproved:    isApproved     ?? existingUser.isApproved,
      },
      select: {
        id: true, firstName: true, lastName: true, name: true,
        email: true, phone: true, role: true, status: true,
        imageUrl: true, emailVerified: true, isApproved: true,
        createdAt: true, updatedAt: true,
      },
      
    });
    if (isApproved === true && !existingUser.isApproved) {
      // Also approve the onboarding record so the KYC status reflects correctly
      await db.individualOnboarding.updateMany({
        where: { userId: id },
        data:  { isApproved: true },
      }).catch(() => {}); // non-fatal if no onboarding exists
      await db.companyOnboarding.updateMany({
        where: { userId: id },
        data:  { isApproved: true },
      }).catch(() => {});

      try {
        await sendAccountVerifiedEmail({
          to: updatedUser.email,
          name: updatedUser.firstName ?? updatedUser.name ?? "there",
        });
      } catch (emailError) {
        console.error("updateUser: failed to send approval email:", emailError);
      }
    }

    return res.status(200).json({ data: updatedUser, error: null });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({ data: null, error: "Failed to update user" });
  }
}

/* ============================
   SOFT DELETE USER
============================= */
export async function deleteUser(req: AuthRequest, res: Response) {
  const { id } = req.params;

  try {
    const existingUser = await db.user.findUnique({ where: { id } });
    if (!existingUser) return res.status(404).json({ data: null, error: "User not found" });

    await db.user.delete({ where: { id } });
    return res.status(200).json({ data: null, message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ data: null, error: "Failed to delete user" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /users/:userId/activity-logs/pdf
// Streams a PDF report of all ActivityLog entries for the given user.
// Query params:
//   startDate  ISO date string — filter logs on or after this date
//   endDate    ISO date string — filter logs on or before this date
//   limit      max rows (default 500, max 2000)
// ─────────────────────────────────────────────────────────────────────────────

const PDF_NAVY   = "#1B3A6B";
const PDF_BLUE   = "#2E6DA4";
const PDF_ROW_A  = "#F0F4FA";
const PDF_BORDER = "#D0D8E8";
const PAGE_W     = 595;
const PAGE_H     = 842;
const MARGIN     = 36;
const CONTENT_W  = PAGE_W - MARGIN * 2;
// Reserve 30px at the bottom for the footer on every page
const BOTTOM_LIMIT = PAGE_H - 44;

function pdfFmtDate(d: Date): string {
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC",
  }) + " UTC";
}

function pdfTrunc(s: string | null | undefined, max: number): string {
  if (!s) return "-";
  return s.length > max ? s.slice(0, max - 1) + "." : s;
}

// Drawn inline at the bottom of each page before calling doc.addPage()
function drawActivityFooter(
  doc: PDFKit.PDFDocument,
  pageNum: number,
  generatedDate: string,
) {
  const fy = PAGE_H - 30;
  doc.moveTo(MARGIN, fy).lineTo(PAGE_W - MARGIN, fy).lineWidth(0.4).stroke(PDF_BORDER);
  doc.fillColor("#888888").font("Helvetica").fontSize(7)
     .text(
       `GoldKach Investment Ltd  -  Confidential  -  Generated ${generatedDate}`,
       MARGIN, fy + 5, { width: CONTENT_W - 60, lineBreak: false },
     );
  doc.text(`Page ${pageNum}`, PAGE_W - MARGIN - 50, fy + 5, {
    width: 50, align: "right", lineBreak: false,
  });
}

// Draw the table column header row; returns new y position
function drawTableHeader(doc: PDFKit.PDFDocument, colX: Record<string, number>, colW: Record<string, number>, y: number, rowH: number): number {
  // Pass 1 — background
  doc.rect(MARGIN, y, CONTENT_W, rowH).fill(PDF_NAVY);
  // Pass 2 — text
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7);
  doc.text("DATE (UTC)",  colX.date   + 3, y + 5, { width: colW.date   - 4, lineBreak: false });
  doc.text("ACTION",      colX.action + 3, y + 5, { width: colW.action - 4, lineBreak: false });
  doc.text("MODULE",      colX.module + 3, y + 5, { width: colW.module - 4, lineBreak: false });
  doc.text("STATUS",      colX.status + 3, y + 5, { width: colW.status - 4, lineBreak: false });
  doc.text("IP ADDRESS",  colX.ip     + 3, y + 5, { width: colW.ip     - 4, lineBreak: false });
  doc.text("DESCRIPTION", colX.desc   + 3, y + 5, { width: colW.desc   - 4, lineBreak: false });
  return y + rowH;
}

export async function downloadActivityLogsPdf(req: Request, res: Response) {
  const { userId } = req.params;
  const {
    startDate,
    endDate,
    limit: limitParam,
  } = req.query as Record<string, string | undefined>;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true, firstName: true, lastName: true, email: true, role: true,
        masterWallet: { select: { accountNumber: true } },
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const limit = Math.min(Number(limitParam) || 500, 2000);
    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate)   dateFilter.lte = new Date(endDate);

    const logs = await db.activityLog.findMany({
      where: {
        userId,
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
    const generatedAt = new Date();
    const genDateStr  = generatedAt.toISOString().slice(0, 10);
    const dateRange   = startDate || endDate
      ? `${startDate ?? "-"} to ${endDate ?? "-"}`
      : "All time";

    // ── Set up PDF ────────────────────────────────────────────────────────────

    const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: true });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="activity-log-${displayName.replace(/\s+/g, "-")}-${genDateStr}.pdf"`,
    );
    doc.pipe(res);

    // ── Page 1: header banner ─────────────────────────────────────────────────

    // Pass 1 — background
    doc.rect(0, 0, PAGE_W, 68).fill(PDF_NAVY);
    // Pass 2 — text (white on navy)
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(15)
       .text("GOLDKACH INVESTMENT", MARGIN, 16, { width: 280, lineBreak: false });
    doc.fillColor("#AAC4E8").font("Helvetica").fontSize(8)
       .text("Unlocking Global Investments", MARGIN, 34, { lineBreak: false });
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(12)
       .text("User Activity Log", PAGE_W - MARGIN - 160, 18, { width: 160, align: "right", lineBreak: false });
    doc.fillColor("#AAC4E8").font("Helvetica").fontSize(7)
       .text(`Generated: ${pdfFmtDate(generatedAt)}`, PAGE_W - MARGIN - 160, 34, {
         width: 160, align: "right", lineBreak: false,
       });

    let y = 84;

    // ── Client info block ─────────────────────────────────────────────────────

    const infoH = 68;
    // Pass 1 — background
    doc.rect(MARGIN, y, CONTENT_W, infoH).fill("#F7F9FC");
    doc.rect(MARGIN, y, CONTENT_W, infoH).lineWidth(0.5).stroke(PDF_BORDER);
    // Pass 2 — text
    doc.fillColor(PDF_NAVY).font("Helvetica-Bold").fontSize(8)
       .text("CLIENT INFORMATION", MARGIN + 10, y + 8, { lineBreak: false });

    const c1 = MARGIN + 10, c2 = MARGIN + 185, c3 = MARGIN + 370;
    const r1y = y + 22, r2y = y + 46;

    const infoCell = (label: string, val: string, x: number, iy: number) => {
      doc.fillColor("#777777").font("Helvetica").fontSize(6.5)
         .text(label, x, iy, { lineBreak: false });
      doc.fillColor("#111111").font("Helvetica-Bold").fontSize(8.5)
         .text(val, x, iy + 9, { width: 170, lineBreak: false });
    };

    infoCell("CLIENT NAME",   displayName,                               c1, r1y);
    infoCell("EMAIL",         user.email,                                c2, r1y);
    infoCell("ACCOUNT NO.",   user.masterWallet?.accountNumber ?? "-",   c3, r1y);
    infoCell("DATE RANGE",    dateRange,                                  c1, r2y);
    infoCell("ROLE",          user.role,                                  c2, r2y);
    infoCell("TOTAL ENTRIES", String(logs.length),                        c3, r2y);

    y += infoH + 6;

    // ── Stats bar ─────────────────────────────────────────────────────────────

    const successCount = logs.filter(l => (l.status ?? "").toUpperCase() === "SUCCESS").length;
    const failCount    = logs.filter(l => ["FAILED", "ERROR"].includes((l.status ?? "").toUpperCase())).length;
    const otherCount   = logs.length - successCount - failCount;

    // Pass 1 — background
    doc.rect(MARGIN, y, CONTENT_W, 26).fill(PDF_BLUE);
    // Pass 2 — text
    doc.fillColor("#FFFFFF").font("Helvetica").fontSize(8);
    doc.text(`Total: ${logs.length}`,          c1,         y + 9, { lineBreak: false });
    doc.text(`Success: ${successCount}`,        c1 + 120,   y + 9, { lineBreak: false });
    doc.text(`Failed/Error: ${failCount}`,      c2 + 20,    y + 9, { lineBreak: false });
    doc.text(`Other: ${otherCount}`,            c3,         y + 9, { lineBreak: false });

    y += 34;

    // ── Table ─────────────────────────────────────────────────────────────────

    const colW = { date: 108, action: 128, module: 76, status: 58, ip: 80, desc: CONTENT_W - 108 - 128 - 76 - 58 - 80 };
    const colX = {
      date:   MARGIN,
      action: MARGIN + colW.date,
      module: MARGIN + colW.date + colW.action,
      status: MARGIN + colW.date + colW.action + colW.module,
      ip:     MARGIN + colW.date + colW.action + colW.module + colW.status,
      desc:   MARGIN + colW.date + colW.action + colW.module + colW.status + colW.ip,
    };
    const ROW_H = 16;

    let pageNum = 1;
    y = drawTableHeader(doc, colX, colW, y, ROW_H + 2);

    if (logs.length === 0) {
      // Pass 1 — background
      doc.rect(MARGIN, y, CONTENT_W, 40).fill("#F9FAFB");
      // Pass 2 — text
      doc.fillColor("#9CA3AF").font("Helvetica").fontSize(9)
         .text("No activity logs found for the selected criteria.", MARGIN, y + 14, {
           width: CONTENT_W, align: "center",
         });
    }

    for (let i = 0; i < logs.length; i++) {
      // Overflow to next page?
      if (y + ROW_H > BOTTOM_LIMIT) {
        drawActivityFooter(doc, pageNum, genDateStr);
        pageNum++;
        doc.addPage();
        y = MARGIN;
        y = drawTableHeader(doc, colX, colW, y, ROW_H + 2);
      }

      const log    = logs[i];
      const rowBg  = i % 2 === 0 ? PDF_ROW_A : "#FFFFFF";
      const stUC   = (log.status ?? "").toUpperCase();
      const stColor = stUC === "SUCCESS"                    ? "#15803D"
                    : stUC === "FAILED" || stUC === "ERROR" ? "#DC2626"
                    : "#92400E";

      // Pass 1 — background rect (fill only; separate call for border)
      doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(rowBg);
      doc.rect(MARGIN, y, CONTENT_W, ROW_H).lineWidth(0.3).stroke(PDF_BORDER);

      // Pass 2 — all text after all rects
      doc.fillColor("#333333").font("Helvetica").fontSize(6.5)
         .text(pdfFmtDate(log.createdAt), colX.date   + 3, y + 5, { width: colW.date   - 4, lineBreak: false });
      doc.text(pdfTrunc(log.action, 24),  colX.action + 3, y + 5, { width: colW.action - 4, lineBreak: false });
      doc.text(pdfTrunc(log.module, 13),  colX.module + 3, y + 5, { width: colW.module - 4, lineBreak: false });
      doc.fillColor(stColor).font("Helvetica-Bold")
         .text(pdfTrunc(log.status, 10),  colX.status + 3, y + 5, { width: colW.status - 4, lineBreak: false });
      doc.fillColor("#333333").font("Helvetica")
         .text(pdfTrunc(log.ipAddress, 15), colX.ip   + 3, y + 5, { width: colW.ip     - 4, lineBreak: false });
      doc.text(pdfTrunc(log.description, 11), colX.desc + 3, y + 5, { width: colW.desc  - 4, lineBreak: false });

      y += ROW_H;
    }

    // Footer on last page
    drawActivityFooter(doc, pageNum, genDateStr);

    doc.end();
  } catch (error) {
    console.error("downloadActivityLogsPdf error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate activity log PDF" });
    }
  }
}