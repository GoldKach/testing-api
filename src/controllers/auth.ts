// controllers/auth.ts
import { Request, Response } from "express";
import crypto from "crypto";
import { db } from "@/db/db";           // Prisma
import bcrypt from "bcryptjs";
// import  {jwt} from "jsonwebtoken";
import { sendResetEmailResend } from "@/utils/mailer";
import { sendVerificationCodeResend } from "@/lib/mailer";
import { UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";


const RESET_TTL_MIN = 30;

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  const generic = { ok: true, message: "If that email exists, a reset link has been sent." };

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


export async function resetPassword(req: Request, res: Response) {
  const { uid, token, newPassword } = req.body as { uid: string; token: string; newPassword: string };

  try {
    if (!uid || !token || !newPassword) {
      return res.status(400).json({ error: "Missing fields." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const record = await db.passwordResetToken.findFirst({
      where: { userId: uid, tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    await db.$transaction([
      db.user.update({ where: { id: uid }, data: { password: hashed } }),
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.refreshToken.deleteMany({ where: { userId: uid } }), // revoke sessions
    ]);

    return res.status(200).json({ ok: true, message: "Password updated." });
  } catch (e) {
    console.error("resetPassword error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}

// export async function verifyEmail(req: Request, res: Response) {
//   const { email, token } = req.body as { email: string; token: string };
//   if (!email || !token) return res.status(400).json({ error: "Missing fields." });

//   const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
//   if (!user || !user.token || user.token !== token) {
//     return res.status(400).json({ error: "Invalid verification code." });
//   }

//   await db.user.update({
//     where: { id: user.id },
//     data: {
//       emailVerified: true,
//       status: UserStatus.ACTIVE, 
//       token: null,               
//     },
//   });

//   return res.status(200).json({ ok: true, message: "Email verified." });
// }

// POST /auth/resend-verification
export async function resendVerification(req: Request, res: Response) {
  const { email } = req.body as { email: string };
  if (!email) return res.status(400).json({ error: "Email is required." });

  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return res.status(200).json({ ok: true }); // don't leak

  const newCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

  await db.user.update({
    where: { id: user.id },
    data: { token: newCode },
  });

  await sendVerificationCodeResend({
    to: user.email,
    name: user.firstName ?? user.name ?? "there",
    code: newCode,
  });

  return res.status(200).json({ ok: true });
}


// const ACCESS_TTL = "15m";
// const REFRESH_DAYS = 30;

// export async function verifyEmail(req: Request, res: Response) {
//   const { email, token } = req.body as { email: string; token: string };
//   if (!email || !token) return res.status(400).json({ error: "Missing fields." });

//   const user = await db.user.findUnique({
//     where: { email: email.trim().toLowerCase() },
//   });

//   if (!user || !user.token || user.token !== token) {
//     return res.status(400).json({ error: "Invalid verification code." });
//   }

//   // Persist state and revoke old refresh tokens (optional but recommended)
//   await db.$transaction([
//     db.user.update({
//       where: { id: user.id },
//       data: { emailVerified: true, status: UserStatus.ACTIVE, token: null },
//     }),
//     db.refreshToken.deleteMany({ where: { userId: user.id } }),
//   ]);

//   // Mint new tokens (same logic you use in /login)
//   const accessToken = jwt.sign(
//     { sub: user.id, role: user.role },
//     process.env.JWT_SECRET!,
//     { expiresIn: ACCESS_TTL }
//   );

//   const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30;


//   const refreshTokenValue = crypto.randomUUID();
//   await db.refreshToken.create({
//     data: {
//       userId: user.id,
//       token: refreshTokenValue,
//       // set an expiry if your model has it; otherwise store createdAt and enforce TTL in code
//       expiresAt: new Date(Date.now() + REFRESH_TTL_MS),

//     },
//   });

//   const safeUser = {
//     id: user.id,
//     email: user.email,
//     role: user.role,
//     firstName: user.firstName,
//     lastName: user.lastName,
//     imageUrl: user.imageUrl,
//     status: UserStatus.ACTIVE,
//   };

//   return res.status(200).json({
//     ok: true,
//     message: "Email verified.",
//     data: {
//       user: safeUser,
//       accessToken,
//       refreshToken: refreshTokenValue,
//     },
//   });
// }


// export async function verifyEmail(req: Request, res: Response) {
//   const { email, token } = req.body as { email: string; token: string };
//   if (!email || !token) return res.status(400).json({ error: "Missing fields." });

//   const user = await db.user.findUnique({
//     where: { email: email.trim().toLowerCase() },
//   });

//   if (!user || !user.token || user.token !== token) {
//     return res.status(400).json({ error: "Invalid verification code." });
//   }

//   // Mark verified; clear the one-time code
//   await db.user.update({
//     where: { id: user.id },
//     data: { emailVerified: true, status: UserStatus.ACTIVE, token: null },
//   });

//   // No auth cookies/tokens here!
//   return res.status(200).json({
//     ok: true,
//     userId: user.id,
//     email: user.email,
//   });
// }

// controllers/auth.ts - FIXED verifyEmail function

export async function verifyEmail(req: Request, res: Response) {
  const { email, token } = req.body as { email: string; token: string };
  
  // Log what we received
  console.log("[verifyEmail] Received request");
  console.log("[verifyEmail] Email:", email);
  console.log("[verifyEmail] Token:", token);
  console.log("[verifyEmail] Token type:", typeof token);
  
  if (!email || !token) {
    console.log("[verifyEmail] Missing fields");
    return res.status(400).json({ error: "Missing fields." });
  }

  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();
  console.log("[verifyEmail] Normalized email:", normalizedEmail);

  // Find user
  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    console.log("[verifyEmail] User not found");
    return res.status(400).json({ error: "Invalid verification code." });
  }

  console.log("[verifyEmail] User found - ID:", user.id);
  console.log("[verifyEmail] User token in DB:", user.token);
  console.log("[verifyEmail] User token type:", typeof user.token);

  // Check if user has a token
  if (!user.token) {
    console.log("[verifyEmail] No token in database (already used?)");
    return res.status(400).json({ error: "Invalid verification code." });
  }

  // 🔥 CRITICAL FIX: Normalize both tokens before comparison
  const dbToken = String(user.token).trim();
  const inputToken = String(token).trim();
  
  console.log("[verifyEmail] Comparing tokens:");
  console.log("  - DB token:", dbToken);
  console.log("  - Input token:", inputToken);
  console.log("  - Match:", dbToken === inputToken);

  if (dbToken !== inputToken) {
    console.log("[verifyEmail] Token mismatch!");
    return res.status(400).json({ error: "Invalid verification code." });
  }

  console.log("[verifyEmail] Token verified successfully, updating user...");

  // Mark verified; clear the one-time code
  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true, status: UserStatus.ACTIVE, token: null },
  });

  console.log("[verifyEmail] User updated successfully");

  // No auth cookies/tokens here!
  return res.status(200).json({
    ok: true,
    userId: user.id,
    email: user.email,
  });
}