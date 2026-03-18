// controllers/auth.ts - Updated with 2FA Login Flow
import { Request, Response } from "express";
import crypto from "crypto";
import { db } from "@/db/db";
import bcrypt from "bcryptjs";
import { UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken, TokenPayload } from "@/utils/tokens";
import { sendLoginVerificationCode } from "@/utils/mailer";
import { sendResetEmailResend, sendVerificationCodeResend } from "@/lib/mailer";

const RESET_TTL_MIN = 30;
const LOGIN_CODE_TTL_MIN = 10; // 10 minutes for login verification

// Helper to generate 6-digit code
const makeSixDigitToken = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

/* ======================
   STEP 1: INITIATE LOGIN (Send Verification Code)
====================== */
export async function initiateLogin(req: Request, res: Response) {
  const { identifier, password } = req.body as { 
    identifier: string; 
    password: string;
  };

  try {
    if (!identifier || !password) {
      return res.status(400).json({ 
        success: false,
        data: null, 
        error: "Missing credentials" 
      });
    }

    const idNorm = identifier.trim().toLowerCase();
    
    // Find user by email or phone
    const user = await db.user.findFirst({
      where: {
        OR: [
          { email: idNorm },
          { phone: identifier.trim() }
        ],
      },
    });

    if (!user) {
      return res.status(401).json({ 
        success: false,
        data: null, 
        error: "Invalid credentials" 
      });
    }

    // Check account status
    if (user.status === UserStatus.BANNED) {
      return res.status(403).json({ 
        success: false,
        data: null, 
        error: "Account has been banned. Contact support." 
      });
    }

    if (user.status === UserStatus.SUSPENDED) {
      return res.status(403).json({ 
        success: false,
        data: null, 
        error: "Account is temporarily suspended. Contact support." 
      });
    }

    if (user.status === UserStatus.DEACTIVATED) {
      return res.status(403).json({ 
        success: false,
        data: null, 
        error: "Account is deactivated. Contact support to reactivate." 
      });
    }

    // Verify password
    if (!user.password) {
      return res.status(401).json({ 
        success: false,
        data: null, 
        error: "This account has no password. Use social login or reset password." 
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        data: null, 
        error: "Invalid credentials" 
      });
    }

    // Generate 6-digit verification code
    const verificationCode = makeSixDigitToken();
    const codeExpiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MIN * 60_000);

    // Store the code in user.token with expiry
    // We'll store both code and expiry as JSON string
    const tokenData = JSON.stringify({
      code: verificationCode,
      expiresAt: codeExpiresAt.toISOString(),
      type: "login_2fa"
    });

    await db.user.update({
      where: { id: user.id },
      data: { token: tokenData },
    });

    // Send verification email
    try {
      await sendLoginVerificationCode({
        to: user.email,
        name: user.firstName ?? user.name ?? "there",
        code: verificationCode,
      });
    } catch (emailError) {
      console.error("Error sending login verification email:", emailError);
      return res.status(500).json({ 
        success: false,
        data: null, 
        error: "Failed to send verification code. Please try again." 
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        requiresVerification: true,
        expiresAt: codeExpiresAt,
      },
      message: "Verification code sent to your email. Please check your inbox.",
    });

  } catch (error) {
    console.error("Initiate login error:", error);
    return res.status(500).json({ 
      success: false,
      data: null, 
      error: "An error occurred during login" 
    });
  }
}

/* ======================
   STEP 2: VERIFY LOGIN CODE & COMPLETE LOGIN
====================== */
export async function verifyLoginCode(req: Request, res: Response) {
  const { userId, code } = req.body as { 
    userId: string; 
    code: string;
  };

  try {
    if (!userId || !code) {
      return res.status(400).json({ 
        success: false,
        data: null, 
        error: "Missing verification code or user ID" 
      });
    }

    // Find user
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        data: null, 
        error: "User not found" 
      });
    }

    if (!user.token) {
      return res.status(400).json({ 
        success: false,
        data: null, 
        error: "No verification code found. Please request a new code." 
      });
    }

    // Parse stored token data
    let tokenData: { code: string; expiresAt: string; type: string };
    try {
      tokenData = JSON.parse(user.token);
    } catch (e) {
      return res.status(400).json({ 
        success: false,
        data: null, 
        error: "Invalid verification code format" 
      });
    }

    // Verify it's a login 2FA code
    if (tokenData.type !== "login_2fa") {
      return res.status(400).json({ 
        success: false,
        data: null, 
        error: "Invalid verification code type" 
      });
    }

    // Check expiry
    const expiryDate = new Date(tokenData.expiresAt);
    if (expiryDate < new Date()) {
      return res.status(400).json({ 
        success: false,
        data: null, 
        error: "Verification code has expired. Please login again." 
      });
    }

    // Normalize and compare codes
    const dbCode = String(tokenData.code).trim();
    const inputCode = String(code).trim();

    if (dbCode !== inputCode) {
      return res.status(400).json({ 
        success: false,
        data: null, 
        error: "Invalid verification code" 
      });
    }

    // Code is valid! Clear the token and update status if needed
    await db.user.update({
      where: { id: user.id },
      data: { 
        token: null,
        // Auto-activate account if they're still pending
        status: user.status === UserStatus.PENDING ? UserStatus.ACTIVE : user.status,
        emailVerified: true,
      },
    });

    // Generate access and refresh tokens
    const payload: TokenPayload = {
      userId: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token
    await db.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    // Return safe user data without password
    const { password: _pw, token: _token, ...safeUser } = user;

    return res.status(200).json({
      success: true,
      data: { 
        user: safeUser, 
        accessToken, 
        refreshToken 
      },
      message: "Login successful",
    });

  } catch (error) {
    console.error("Verify login code error:", error);
    return res.status(500).json({ 
      success: false,
      data: null, 
      error: "An error occurred during verification" 
    });
  }
}

/* ======================
   RESEND LOGIN VERIFICATION CODE
====================== */
export async function resendLoginCode(req: Request, res: Response) {
  const { userId } = req.body as { userId: string };

  try {
    if (!userId) {
      return res.status(400).json({ 
        success: false,
        data: null, 
        error: "User ID is required" 
      });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        data: null, 
        error: "User not found" 
      });
    }

    // Generate new code
    const verificationCode = makeSixDigitToken();
    const codeExpiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MIN * 60_000);

    const tokenData = JSON.stringify({
      code: verificationCode,
      expiresAt: codeExpiresAt.toISOString(),
      type: "login_2fa"
    });

    await db.user.update({
      where: { id: user.id },
      data: { token: tokenData },
    });

    // Send email
    try {
      await sendLoginVerificationCode({
        to: user.email,
        name: user.firstName ?? user.name ?? "there",
        code: verificationCode,
      });
    } catch (emailError) {
      console.error("Error sending login verification email:", emailError);
      return res.status(500).json({ 
        success: false,
        data: null, 
        error: "Failed to send verification code" 
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        expiresAt: codeExpiresAt,
      },
      message: "New verification code sent to your email",
    });

  } catch (error) {
    console.error("Resend login code error:", error);
    return res.status(500).json({ 
      success: false,
      data: null, 
      error: "Failed to resend verification code" 
    });
  }
}

/* ======================
   FORGOT PASSWORD
====================== */
export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  const generic = { 
    success: true, 
    message: "If that email exists, a reset link has been sent." 
  };

  try {
    if (!email) return res.status(200).json(generic);

    const user = await db.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) return res.status(200).json(generic);

    // Invalidate old tokens
    await db.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Create token (store only hash)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60_000),
      },
    });

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}&uid=${user.id}`;

    await sendResetEmailResend({
      to: user.email,
      name: user.name ?? user.firstName ?? "there",
      resetUrl,
    });

    return res.status(200).json(generic);
  } catch (e) {
    console.error("forgotPassword error:", e);
    return res.status(200).json(generic);
  }
}

/* ======================
   RESET PASSWORD
====================== */
export async function resetPassword(req: Request, res: Response) {
  const { uid, token, newPassword } = req.body as { 
    uid: string; 
    token: string; 
    newPassword: string;
  };

  try {
    if (!uid || !token || !newPassword) {
      return res.status(400).json({ 
        success: false,
        error: "Missing fields." 
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const record = await db.passwordResetToken.findFirst({
      where: { userId: uid, tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid or expired reset token." 
      });
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    await db.$transaction([
      db.user.update({ where: { id: uid }, data: { password: hashed } }),
      db.passwordResetToken.update({ 
        where: { id: record.id }, 
        data: { usedAt: new Date() } 
      }),
      db.refreshToken.deleteMany({ where: { userId: uid } }), // revoke sessions
    ]);

    return res.status(200).json({ 
      success: true, 
      message: "Password updated successfully." 
    });
  } catch (e) {
    console.error("resetPassword error:", e);
    return res.status(500).json({ 
      success: false,
      error: "Server error" 
    });
  }
}

/* ======================
   VERIFY EMAIL (For Initial Registration)
====================== */
export async function verifyEmail(req: Request, res: Response) {
  const { email, token } = req.body as { email: string; token: string };
  
  console.log("[verifyEmail] Received request");
  console.log("[verifyEmail] Email:", email);
  console.log("[verifyEmail] Token:", token);
  
  if (!email || !token) {
    console.log("[verifyEmail] Missing fields");
    return res.status(400).json({ 
      success: false,
      error: "Missing fields." 
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  console.log("[verifyEmail] Normalized email:", normalizedEmail);

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    console.log("[verifyEmail] User not found");
    return res.status(400).json({ 
      success: false,
      error: "Invalid verification code." 
    });
  }

  console.log("[verifyEmail] User found - ID:", user.id);

  if (!user.token) {
    console.log("[verifyEmail] No token in database");
    return res.status(400).json({ 
      success: false,
      error: "Invalid verification code." 
    });
  }

  // Try to parse as JSON (new format) or use as plain string (old format)
  let codeToCompare: string;
  try {
    const tokenData = JSON.parse(user.token);
    // If it's a login 2FA code, reject it here
    if (tokenData.type === "login_2fa") {
      return res.status(400).json({ 
        success: false,
        error: "Invalid verification code type." 
      });
    }
    codeToCompare = tokenData.code || user.token;
  } catch {
    // Not JSON, use as plain string (backward compatible)
    codeToCompare = user.token;
  }

  const dbToken = String(codeToCompare).trim();
  const inputToken = String(token).trim();
  
  console.log("[verifyEmail] Comparing tokens");

  if (dbToken !== inputToken) {
    console.log("[verifyEmail] Token mismatch!");
    return res.status(400).json({ 
      success: false,
      error: "Invalid verification code." 
    });
  }

  console.log("[verifyEmail] Token verified, updating user...");

  await db.user.update({
    where: { id: user.id },
    data: { 
      emailVerified: true, 
      status: UserStatus.ACTIVE, 
      token: null 
    },
  });

  console.log("[verifyEmail] User updated successfully");

  return res.status(200).json({
    success: true,
    data: {
      userId: user.id,
      email: user.email,
    },
    message: "Email verified successfully",
  });
}

/* ======================
   RESEND VERIFICATION (For Initial Registration)
====================== */
export async function resendVerification(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  
  if (!email) {
    return res.status(400).json({ 
      success: false,
      error: "Email is required." 
    });
  }

  const user = await db.user.findUnique({ 
    where: { email: email.trim().toLowerCase() } 
  });
  
  if (!user) {
    return res.status(200).json({ 
      success: true,
      message: "If that email exists, a verification code has been sent." 
    });
  }

  const newCode = makeSixDigitToken();

  await db.user.update({
    where: { id: user.id },
    data: { token: newCode },
  });

  await sendVerificationCodeResend({
    to: user.email,
    name: user.firstName ?? user.name ?? "there",
    code: newCode,
  });

  return res.status(200).json({ 
    success: true,
    message: "Verification code sent to your email." 
  });
}