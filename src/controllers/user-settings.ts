// src/controllers/user-settings.ts
import { Response } from "express";
import { db } from "@/db/db";
import bcrypt from "bcryptjs";
import { AuthRequest } from "@/utils/auth";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const SALT_ROUNDS = 10;

function getUserIdFromRequest(req: AuthRequest): string | null {
  return (
    req.user?.userId ||
    (req.body?.userId as string) ||
    (req.query?.userId as string) ||
    null
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{1,14}$/.test(phone);
}

/* ------------------------------------------------------------------ */
/*  GET USER SETTINGS                                                   */
/* ------------------------------------------------------------------ */
export async function getUserSettings(req: AuthRequest, res: Response) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ data: null, error: "Unauthorized - Please login again" });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id:            true,
        name:          true,
        firstName:     true,
        lastName:      true,
        email:         true,
        emailVerified: true,
        phone:         true,
        imageUrl:      true,
        role:          true,
        status:        true,
        isApproved:    true,
        createdAt:     true,
        updatedAt:     true,
        // Expose master wallet summary in settings
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
        // Brief portfolio summary for settings page
        userPortfolios: {
          where:   { isActive: true },
          orderBy: { createdAt: "desc" },
          select: {
            id:             true,
            customName:     true,
            portfolioValue: true,
            totalInvested:  true,
            totalLossGain:  true,
            isActive:       true,
            portfolio:      { select: { id: true, name: true, riskTolerance: true, timeHorizon: true } },
            wallet: {
              select: {
                id:           true,
                accountNumber: true,
                netAssetValue: true,
                balance:      true,
                status:       true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ data: null, error: "User not found" });
    }

    return res.status(200).json({ data: user, error: null });
  } catch (error) {
    console.error("getUserSettings error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch user settings" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE PROFILE                                                      */
/* ------------------------------------------------------------------ */
export async function updateProfile(req: AuthRequest, res: Response) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ data: null, error: "Unauthorized" });
    }

    const { name, firstName, lastName } = req.body as {
      name?: string; firstName?: string; lastName?: string; userId?: string;
    };

    if (!name && !firstName && !lastName) {
      return res.status(400).json({
        data: null,
        error: "At least one field (name, firstName, lastName) must be provided",
      });
    }
    if (name      && name.trim().length      < 2) return res.status(400).json({ data: null, error: "Name must be at least 2 characters" });
    if (firstName && firstName.trim().length < 2) return res.status(400).json({ data: null, error: "First name must be at least 2 characters" });
    if (lastName  && lastName.trim().length  < 2) return res.status(400).json({ data: null, error: "Last name must be at least 2 characters" });

    const updated = await db.user.update({
      where: { id: userId },
      data: {
        ...(name      && { name:      name.trim()      }),
        ...(firstName && { firstName: firstName.trim() }),
        ...(lastName  && { lastName:  lastName.trim()  }),
      },
      select: {
        id: true, name: true, firstName: true, lastName: true,
        email: true, phone: true, imageUrl: true, updatedAt: true,
      },
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (error) {
    console.error("updateProfile error:", error);
    return res.status(500).json({ data: null, error: "Failed to update profile" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE EMAIL                                                        */
/* ------------------------------------------------------------------ */
export async function updateEmail(req: AuthRequest, res: Response) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ data: null, error: "Unauthorized" });

    const { email, password } = req.body as { email: string; password: string; userId?: string };

    if (!email || !password) {
      return res.status(400).json({ data: null, error: "Email and password are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ data: null, error: "Invalid email format" });
    }

    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, password: true },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    if (!(await bcrypt.compare(password, user.password!))) {
      return res.status(401).json({ data: null, error: "Invalid password" });
    }

    const conflict = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (conflict && conflict.id !== userId) {
      return res.status(409).json({ data: null, error: "Email already in use" });
    }

    const updated = await db.user.update({
      where:  { id: userId },
      data:   { email: email.toLowerCase(), emailVerified: false },
      select: { id: true, email: true, emailVerified: true, updatedAt: true },
    });

    return res.status(200).json({
      data:    updated,
      error:   null,
      message: "Email updated. Please verify your new email address.",
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Email already in use" });
    }
    console.error("updateEmail error:", error);
    return res.status(500).json({ data: null, error: "Failed to update email" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE PHONE                                                        */
/* ------------------------------------------------------------------ */
export async function updatePhone(req: AuthRequest, res: Response) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ data: null, error: "Unauthorized" });

    const { phone, password } = req.body as { phone: string; password: string; userId?: string };

    if (!phone || !password) {
      return res.status(400).json({ data: null, error: "Phone and password are required" });
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({
        data: null,
        error: "Invalid phone format. Use international format (e.g. +256700000000)",
      });
    }

    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, phone: true, password: true },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    if (!(await bcrypt.compare(password, user.password!))) {
      return res.status(401).json({ data: null, error: "Invalid password" });
    }

    const conflict = await db.user.findUnique({ where: { phone } });
    if (conflict && conflict.id !== userId) {
      return res.status(409).json({ data: null, error: "Phone number already in use" });
    }

    const updated = await db.user.update({
      where:  { id: userId },
      data:   { phone },
      select: { id: true, phone: true, updatedAt: true },
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Phone number already in use" });
    }
    console.error("updatePhone error:", error);
    return res.status(500).json({ data: null, error: "Failed to update phone" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE PASSWORD                                                     */
/* ------------------------------------------------------------------ */
export async function updatePassword(req: AuthRequest, res: Response) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ data: null, error: "Unauthorized" });

    const { currentPassword, newPassword, confirmPassword } = req.body as {
      currentPassword: string; newPassword: string; confirmPassword: string; userId?: string;
    };

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ data: null, error: "Current password, new password, and confirmation are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ data: null, error: "New password must be at least 8 characters long" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ data: null, error: "New password and confirmation do not match" });
    }

    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, password: true },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    if (!(await bcrypt.compare(currentPassword, user.password!))) {
      return res.status(401).json({ data: null, error: "Current password is incorrect" });
    }
    if (await bcrypt.compare(newPassword, user.password!)) {
      return res.status(400).json({ data: null, error: "New password must be different from current password" });
    }

    await db.user.update({
      where: { id: userId },
      data:  { password: await bcrypt.hash(newPassword, SALT_ROUNDS) },
    });

    return res.status(200).json({ data: null, error: null, message: "Password updated successfully" });
  } catch (error) {
    console.error("updatePassword error:", error);
    return res.status(500).json({ data: null, error: "Failed to update password" });
  }
}

/* ------------------------------------------------------------------ */
/*  UPDATE PROFILE IMAGE                                                */
/* ------------------------------------------------------------------ */
export async function updateProfileImage(req: AuthRequest, res: Response) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ data: null, error: "Unauthorized" });

    const { imageUrl } = req.body as { imageUrl: string; userId?: string };

    if (imageUrl === undefined || imageUrl === null) {
      return res.status(400).json({ data: null, error: "Image URL is required" });
    }
    if (imageUrl !== "") {
      try { new URL(imageUrl); } catch {
        return res.status(400).json({ data: null, error: "Invalid image URL" });
      }
    }

    const updated = await db.user.update({
      where:  { id: userId },
      data:   { imageUrl },
      select: { id: true, imageUrl: true, updatedAt: true },
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (error) {
    console.error("updateProfileImage error:", error);
    return res.status(500).json({ data: null, error: "Failed to update profile image" });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE ACCOUNT (soft)                                               */
/* ------------------------------------------------------------------ */
export async function deleteAccount(req: AuthRequest, res: Response) {
  try {
    const userId = getUserIdFromRequest(req);
    if (!userId) return res.status(401).json({ data: null, error: "Unauthorized" });

    const { password, confirmation } = req.body as {
      password: string; confirmation: string; userId?: string;
    };

    if (!password || confirmation !== "DELETE") {
      return res.status(400).json({
        data: null,
        error: "Password and confirmation (type 'DELETE') are required",
      });
    }

    const user = await db.user.findUnique({
      where:  { id: userId },
      select: { id: true, password: true, status: true },
    });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    if (!(await bcrypt.compare(password, user.password!))) {
      return res.status(401).json({ data: null, error: "Invalid password" });
    }

    await db.user.update({ where: { id: userId }, data: { status: "DEACTIVATED" } });

    return res.status(200).json({ data: null, error: null, message: "Account deactivated successfully" });
  } catch (error) {
    console.error("deleteAccount error:", error);
    return res.status(500).json({ data: null, error: "Failed to delete account" });
  }
}