// src/controllers/users.ts
import { db } from "@/db/db";
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto, { randomInt } from "crypto";
import {
  generateAccessToken,
  generateRefreshToken,
  TokenPayload,
} from "@/utils/tokens";
import { AuthRequest } from "@/utils/auth";
import { UserRole, UserStatus } from "@prisma/client";
import { sendVerificationCodeResend } from "@/lib/mailer";
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
      id:            true,
      accountNumber: true,
      balance:       true,
      netAssetValue: true,
      totalFees:     true,
      status:        true,
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

  // ── Onboarding (new split schema — include both, only one will be non-null) ──
  individualOnboarding: {
    select: {
      id:           true,
      fullName:     true,
      // entityType:   true,
      isApproved:   true,
      createdAt:    true,
    },
  },
  companyOnboarding: {
    select: {
      id:          true,
      companyName: true,
      companyType: true,
      isApproved:  true,
      createdAt:   true,
    },
  },

  // ── Master wallet (one per user — new schema) ─────────────────────────────
  masterWallet: {
    select: {
      id:             true,
      accountNumber:  true,
      totalDeposited: true,
      totalWithdrawn: true,
      totalFees:      true,
      netAssetValue:  true,
      status:         true,
    },
  },

  deposits: {
    where:   { transactionStatus: "PENDING" as const },
    orderBy: { createdAt: "desc" as const },
    take:    10,
    select: {
      id:                true,
      amount:            true,
      transactionStatus: true,
      depositTarget:     true,
      userPortfolioId:   true,
      createdByName:     true,
      createdAt:         true,
    },
  },
  withdrawals: {
    where:   { transactionStatus: "PENDING" as const },
    orderBy: { createdAt: "desc" as const },
    take:    10,
    select: {
      id:                true,
      amount:            true,
      transactionStatus: true,
      userPortfolioId:   true,
      createdByName:     true,
      createdAt:         true,
    },
  },
  userPortfolios: { select: userPortfolioSelect },
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

    // MasterWallet fee defaults
    const bankFee        = 30;
    const transactionFee = 10;
    const feeAtBank      = 10;
    const totalFees      = bankFee + transactionFee + feeAtBank;

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
export async function loginUser(req: Request, res: Response) {
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

    await db.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
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
    const users = await db.user.findMany({
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
      where:  { id },
      select: userDetailSelect,
    });

    if (!user) return res.status(404).json({ data: null, error: "User not found" });
    return res.status(200).json({ data: user, error: null });
  } catch (error) {
    console.error("Error fetching user by id:", error);
    return res.status(500).json({ data: null, error: "Server error" });
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

    await db.user.update({ where: { id }, data: { status: UserStatus.DEACTIVATED } });
    return res.status(200).json({ data: null, message: "User deactivated successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ data: null, error: "Failed to delete user" });
  }
}