// src/controllers/staff.ts
import { db } from "@/db/db";
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { UserRole, UserStatus } from "@prisma/client";
import { sendVerificationCodeResend } from "@/lib/mailer";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

const makeSixDigitToken = () =>
  String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const STAFF_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.CLIENT_RELATIONS,
  UserRole.ACCOUNT_MANAGER,
  UserRole.STAFF,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SUPER_ADMIN,
];

const isStaffRole = (role: any): boolean =>
  STAFF_ROLES.includes(role as UserRole);

const staffSelect = {
  id: true,
  firstName: true,
  lastName: true,
  name: true,
  email: true,
  phone: true,
  imageUrl: true,
  role: true,
  status: true,
  isApproved: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
  staffProfile: {
    select: {
      id: true,
      employeeId: true,
      department: true,
      position: true,
      bio: true,
      isActive: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

const assignedClientSelect = {
  id: true,
  agentId: true,
  clientId: true,
  assignedById: true,
  assignedAt: true,
  isActive: true,
  unassignedAt: true,
  client: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      email: true,
      phone: true,
      imageUrl: true,
      role: true,
      status: true,
      isApproved: true,
      // ── Onboarding (new split schema) ──
      individualOnboarding: {
        select: {
          id: true,
          fullName: true,
          // entityType: true,
          isApproved: true,
          createdAt: true,
        },
      },
      companyOnboarding: {
        select: {
          id: true,
          companyName: true,
          companyType: true,
          isApproved: true,
          createdAt: true,
        },
      },
      // ── Wallet (new schema) ──
      masterWallet: {
        select: {
          id: true,
          accountNumber: true,
          totalDeposited: true,
          totalWithdrawn: true,
          totalFees: true,
          netAssetValue: true,
          status: true,
        },
      },
      deposits: {
        where: { transactionStatus: "PENDING" as const },
        orderBy: { createdAt: "desc" as const },
        take: 5,
        select: {
          id: true,
          amount: true,
          transactionStatus: true,
          createdAt: true,
        },
      },
      withdrawals: {
        where: { transactionStatus: "PENDING" as const },
        orderBy: { createdAt: "desc" as const },
        take: 5,
        select: {
          id: true,
          amount: true,
          transactionStatus: true,
          createdAt: true,
        },
      },
      userPortfolios: {
        select: {
          id: true,
          customName: true,
          portfolioValue: true,
          totalInvested: true,
          totalLossGain: true,
          isActive: true,
          portfolio: true,
          userAssets: {
            select: {
              id: true,
              allocationPercentage: true,
              costPerShare: true,
              costPrice: true,
              stock: true,
              closeValue: true,
              lossGain: true,
              asset: true,
            },
          },
        },
      },
    },
  },
} as const;

/* ─────────────────────────────────────────
   CREATE STAFF MEMBER
   POST /staff
───────────────────────────────────────── */
export async function createStaffMember(req: Request, res: Response) {
  const {
    email,
    phone,
    password,
    firstName,
    lastName,
    imageUrl,
    role,
    department,
    position,
    bio,
    employeeId,
    createdById,
  } = req.body as {
    email: string;
    phone: string;
    password: string;
    firstName: string;
    lastName?: string;
    imageUrl?: string;
    role?: UserRole | string;
    department?: string;
    position?: string;
    bio?: string;
    employeeId?: string;
    createdById?: string;
  };

  try {
    if (!email || !phone || !password || !firstName) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Missing required fields: email, phone, password, firstName.",
        errors: {},
      });
    }

    const roleValue: UserRole =
      role && isStaffRole(role) ? (role as UserRole) : UserRole.STAFF;

    if (roleValue === UserRole.USER) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Use the /register endpoint to create client accounts.",
        errors: { role: "Invalid staff role." },
      });
    }

    const emailNorm = email.trim().toLowerCase();
    const phoneNorm = phone.trim();
    const displayName = lastName?.trim()
      ? `${firstName.trim()} ${lastName.trim()}`
      : firstName.trim();

    const [existingEmail, existingPhone] = await Promise.all([
      db.user.findUnique({ where: { email: emailNorm }, select: { id: true } }),
      db.user.findUnique({ where: { phone: phoneNorm }, select: { id: true } }),
    ]);

    if (existingEmail && existingPhone) {
      return res.status(409).json({
        success: false,
        data: null,
        message: "Email and phone are already registered.",
        errors: {
          email: "Email address is already registered",
          phone: "Phone number is already registered",
        },
      });
    }
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        data: null,
        message: "Email address is already registered.",
        errors: { email: "Email address is already registered" },
      });
    }
    if (existingPhone) {
      return res.status(409).json({
        success: false,
        data: null,
        message: "Phone number is already registered.",
        errors: { phone: "Phone number is already registered" },
      });
    }

    if (employeeId) {
      const existingEmpId = await db.staffProfile.findUnique({
        where: { employeeId },
        select: { id: true },
      });
      if (existingEmpId) {
        return res.status(409).json({
          success: false,
          data: null,
          message: "Employee ID is already in use.",
          errors: { employeeId: "Employee ID already exists" },
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationCode = makeSixDigitToken();

    const newStaff = await db.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          email: emailNorm,
          phone: phoneNorm,
          firstName: firstName.trim(),
          lastName: lastName?.trim() || "",
          name: displayName,
          imageUrl,
          password: hashedPassword,
          role: roleValue,
          status: UserStatus.ACTIVE,
          emailVerified: false,
          isApproved: true,
          token: verificationCode,
          staffProfile: {
            create: {
              employeeId: employeeId ?? undefined,
              department: department ?? undefined,
              position: position ?? undefined,
              bio: bio ?? undefined,
              isActive: true,
              createdById: createdById ?? undefined,
            },
          },
        },
        select: staffSelect,
      });
    });

    try {
      await sendVerificationCodeResend({
        to: newStaff.email,
        name: newStaff.firstName ?? newStaff.name ?? "there",
        code: verificationCode,
      });
    } catch (emailError) {
      console.error("Failed to send staff welcome email:", emailError);
    }

    return res.status(201).json({
      success: true,
      data: newStaff,
      message: "Staff member created successfully.",
      errors: {},
    });
  } catch (error: any) {
    console.error("Error creating staff member:", error);
    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        data: null,
        message: "Email, phone, or employee ID already in use.",
        errors: {},
      });
    }
    return res.status(500).json({
      success: false,
      data: null,
      message: "Something went wrong. Please try again.",
      errors: {},
    });
  }
}

/* ─────────────────────────────────────────
   GET ALL STAFF
   GET /staff
───────────────────────────────────────── */
export async function getAllStaff(req: Request, res: Response) {
  try {
    const { role, department, isActive } = req.query as {
      role?: string;
      department?: string;
      isActive?: string;
    };

    const staff = await db.user.findMany({
      where: {
        staffProfile: { isNot: null },
        ...(role && isStaffRole(role) ? { role: role as UserRole } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        ...staffSelect,
        staffProfile: {
          select: {
            id: true,
            employeeId: true,
            department: true,
            position: true,
            bio: true,
            isActive: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { assignedClients: true },
            },
          },
          where: {
            ...(department ? { department } : {}),
            ...(isActive !== undefined ? { isActive: isActive === "true" } : {}),
          },
        },
      },
    });

    const filtered = staff.filter((s) => s.staffProfile !== null);
    return res.status(200).json({ success: true, data: filtered, error: null });
  } catch (error) {
    console.error("Error fetching staff:", error);
    return res
      .status(500)
      .json({ success: false, data: null, error: "Failed to fetch staff members." });
  }
}

/* ─────────────────────────────────────────
   GET STAFF BY ID
   GET /staff/:id
───────────────────────────────────────── */
export async function getStaffById(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const staff = await db.user.findUnique({
      where: { id },
      select: {
        ...staffSelect,
        staffProfile: {
          select: {
            id: true,
            employeeId: true,
            department: true,
            position: true,
            bio: true,
            isActive: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
            assignedClients: {
              where: { isActive: true },
              select: assignedClientSelect,
              orderBy: { assignedAt: "desc" },
            },
          },
        },
      },
    });

    if (!staff) {
      return res
        .status(404)
        .json({ success: false, data: null, error: "Staff member not found." });
    }
    if (!staff.staffProfile) {
      return res
        .status(404)
        .json({ success: false, data: null, error: "This user is not a staff member." });
    }

    return res.status(200).json({ success: true, data: staff, error: null });
  } catch (error) {
    console.error("Error fetching staff by ID:", error);
    return res.status(500).json({ success: false, data: null, error: "Server error." });
  }
}

/* ─────────────────────────────────────────
   UPDATE STAFF MEMBER
   PUT /staff/:id
───────────────────────────────────────── */
export async function updateStaffMember(req: Request, res: Response) {
  const { id } = req.params;
  const {
    firstName,
    lastName,
    email,
    phone,
    role,
    status,
    imageUrl,
    department,
    position,
    bio,
    employeeId,
    isActive,
  } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    role?: string;
    status?: string;
    imageUrl?: string;
    department?: string;
    position?: string;
    bio?: string;
    employeeId?: string;
    isActive?: boolean;
  };

  try {
    const existing = await db.user.findUnique({
      where: { id },
      include: { staffProfile: { select: { id: true } } },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, data: null, error: "User not found." });
    }
    if (!existing.staffProfile) {
      return res
        .status(400)
        .json({ success: false, data: null, error: "This user is not a staff member." });
    }

    if (email || phone) {
      const emailNorm = email?.trim().toLowerCase();
      const phoneNorm = phone?.trim();
      const conflict = await db.user.findFirst({
        where: {
          OR: [
            ...(emailNorm ? [{ email: emailNorm }] : []),
            ...(phoneNorm ? [{ phone: phoneNorm }] : []),
          ],
          NOT: { id },
        },
        select: { id: true },
      });
      if (conflict) {
        return res.status(409).json({
          success: false,
          data: null,
          error: "Email or phone already in use by another user.",
        });
      }
    }

    if (employeeId) {
      const empConflict = await db.staffProfile.findFirst({
        where: { employeeId, NOT: { userId: id } },
        select: { id: true },
      });
      if (empConflict) {
        return res.status(409).json({
          success: false,
          data: null,
          error: "Employee ID is already in use.",
        });
      }
    }

    const nextFirst = firstName?.trim() ?? existing.firstName;
    const nextLast =
      lastName !== undefined
        ? lastName?.trim() ?? ""
        : existing.lastName ?? "";
    const nextName = nextLast
      ? `${nextFirst} ${nextLast}`.trim()
      : nextFirst;

    const updated = await db.user.update({
      where: { id },
      data: {
        firstName: nextFirst,
        lastName: nextLast,
        name: nextName,
        ...(email ? { email: email.trim().toLowerCase() } : {}),
        ...(phone ? { phone: phone.trim() } : {}),
        ...(role && isStaffRole(role) ? { role: role as UserRole } : {}),
        ...(status ? { status: status as UserStatus } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        staffProfile: {
          update: {
            ...(department !== undefined ? { department } : {}),
            ...(position !== undefined ? { position } : {}),
            ...(bio !== undefined ? { bio } : {}),
            ...(employeeId !== undefined ? { employeeId } : {}),
            ...(isActive !== undefined ? { isActive } : {}),
          },
        },
      },
      select: staffSelect,
    });

    return res.status(200).json({ success: true, data: updated, error: null });
  } catch (error: any) {
    console.error("Error updating staff member:", error);
    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        data: null,
        error: "Email, phone, or employee ID already in use.",
      });
    }
    return res
      .status(500)
      .json({ success: false, data: null, error: "Failed to update staff member." });
  }
}

/* ─────────────────────────────────────────
   DEACTIVATE STAFF MEMBER
   DELETE /staff/:id
───────────────────────────────────────── */
export async function deactivateStaffMember(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const existing = await db.user.findUnique({
      where: { id },
      include: { staffProfile: { select: { id: true } } },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, data: null, error: "User not found." });
    }
    if (!existing.staffProfile) {
      return res
        .status(400)
        .json({ success: false, data: null, error: "This user is not a staff member." });
    }

    await db.$transaction([
      db.user.update({
        where: { id },
        data: { status: UserStatus.INACTIVE },
      }),
      db.staffProfile.update({
        where: { userId: id },
        data: { isActive: false },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: null,
      message: "Staff member deactivated successfully.",
    });
  } catch (error) {
    console.error("Error deactivating staff member:", error);
    return res
      .status(500)
      .json({ success: false, data: null, error: "Failed to deactivate staff member." });
  }
}

/* ─────────────────────────────────────────
   GET CLIENTS FOR AN AGENT
   GET /staff/:id/clients
───────────────────────────────────────── */
export async function getAgentClients(req: Request, res: Response) {
  const { id } = req.params;
  const { includeInactive } = req.query as { includeInactive?: string };

  try {
    const staffProfile = await db.staffProfile.findUnique({
      where: { userId: id },
      select: { id: true },
    });

    if (!staffProfile) {
      return res
        .status(404)
        .json({ success: false, data: null, error: "Staff member not found." });
    }

    const assignments = await db.agentClientAssignment.findMany({
      where: {
        agentId: staffProfile.id,
        ...(includeInactive === "true" ? {} : { isActive: true }),
      },
      select: assignedClientSelect,
      orderBy: { assignedAt: "desc" },
    });

    return res.status(200).json({ success: true, data: assignments, error: null });
  } catch (error) {
    console.error("Error fetching agent clients:", error);
    return res
      .status(500)
      .json({ success: false, data: null, error: "Failed to fetch agent clients." });
  }
}

/* ─────────────────────────────────────────
   ASSIGN CLIENT TO AGENT
   POST /staff/:id/clients
───────────────────────────────────────── */
export async function assignClientToAgent(req: Request, res: Response) {
  const { id } = req.params;
  const { clientId, assignedById } = req.body as {
    clientId: string;
    assignedById?: string;
  };

  try {
    if (!clientId) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "clientId is required.",
        errors: { clientId: "Please provide a client ID." },
      });
    }

    const staffProfile = await db.staffProfile.findUnique({
      where: { userId: id },
      select: { id: true, isActive: true },
    });

    if (!staffProfile) {
      return res
        .status(404)
        .json({ success: false, data: null, error: "Staff member not found." });
    }
    if (!staffProfile.isActive) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Cannot assign clients to an inactive staff member.",
      });
    }

    const client = await db.user.findUnique({
      where: { id: clientId },
      select: { id: true, role: true, staffProfile: { select: { id: true } } },
    });

    if (!client) {
      return res
        .status(404)
        .json({ success: false, data: null, error: "Client not found." });
    }
    if (client.staffProfile) {
      return res.status(400).json({
        success: false,
        data: null,
        error: "Cannot assign a staff member as a client.",
      });
    }

    const existingAssignment = await db.agentClientAssignment.findUnique({
      where: { clientId },
      select: { id: true, agentId: true, isActive: true },
    });

    const now = new Date();

    const assignment = await db.$transaction(async (tx) => {
  if (existingAssignment) {
    // Always update the existing record — change agent, reactivate, update timestamp
    return tx.agentClientAssignment.update({
      where: { id: existingAssignment.id },
      data: {
        agentId: staffProfile.id,          // ← new agent
        isActive: true,
        unassignedAt: null,
        assignedAt: now,
        assignedById: assignedById ?? null,
      },
      select: assignedClientSelect,
    });
  }

  // No prior assignment — create fresh
  return tx.agentClientAssignment.create({
    data: {
      agentId: staffProfile.id,
      clientId,
      assignedById: assignedById ?? null,
      isActive: true,
    },
    select: assignedClientSelect,
  });
});

    return res.status(201).json({
      success: true,
      data: assignment,
      message: "Client assigned to agent successfully.",
    });
  } catch (error: any) {
    console.error("Error assigning client to agent:", error);
    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        data: null,
        error: "This client is already assigned to this agent.",
      });
    }
    return res
      .status(500)
      .json({ success: false, data: null, error: "Failed to assign client." });
  }
}

/* ─────────────────────────────────────────
   UNASSIGN CLIENT FROM AGENT
   DELETE /staff/:id/clients/:clientId
───────────────────────────────────────── */
export async function unassignClientFromAgent(req: Request, res: Response) {
  const { id, clientId } = req.params;

  try {
    const staffProfile = await db.staffProfile.findUnique({
      where: { userId: id },
      select: { id: true },
    });

    if (!staffProfile) {
      return res
        .status(404)
        .json({ success: false, data: null, error: "Staff member not found." });
    }

    const assignment = await db.agentClientAssignment.findFirst({
      where: { agentId: staffProfile.id, clientId, isActive: true },
      select: { id: true },
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        data: null,
        error: "No active assignment found for this client and agent.",
      });
    }

    await db.agentClientAssignment.update({
      where: { id: assignment.id },
      data: { isActive: false, unassignedAt: new Date() },
    });

    return res.status(200).json({
      success: true,
      data: null,
      message: "Client unassigned from agent successfully.",
    });
  } catch (error) {
    console.error("Error unassigning client:", error);
    return res
      .status(500)
      .json({ success: false, data: null, error: "Failed to unassign client." });
  }
}

/* ─────────────────────────────────────────
   GET AGENT FOR CLIENT
   GET /staff/agent-for-client/:clientId
───────────────────────────────────────── */
export async function getAgentForClient(req: Request, res: Response) {
  const { clientId } = req.params;

  try {
    const assignment = await db.agentClientAssignment.findUnique({
      where: { clientId },
      select: {
        id: true,
        assignedAt: true,
        isActive: true,
        agent: {
          select: {
            id: true,
            userId: true,
            position: true,
            department: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                name: true,
                email: true,
                phone: true,
                imageUrl: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!assignment || !assignment.isActive) {
      return res.status(404).json({
        success: false,
        data: null,
        error: "No agent currently assigned to this client.",
      });
    }

    return res.status(200).json({ success: true, data: assignment, error: null });
  } catch (error) {
    console.error("Error fetching agent for client:", error);
    return res.status(500).json({ success: false, data: null, error: "Server error." });
  }
}

// src/controllers/staff.ts — add this function
export async function hardDeleteStaffMember(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const existing = await db.user.findUnique({
      where: { id },
      include: { staffProfile: { select: { id: true } } },
    });
    if (!existing) {
      return res.status(404).json({ success: false, data: null, error: "User not found." });
    }
    if (!existing.staffProfile) {
      return res.status(400).json({ success: false, data: null, error: "This user is not a staff member." });
    }

    // Unassign all clients first
    await db.agentClientAssignment.updateMany({
      where: { agentId: existing.staffProfile.id, isActive: true },
      data: { isActive: false, unassignedAt: new Date() },
    });

    // Hard delete the user (cascades to staffProfile via onDelete: Cascade)
    await db.user.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      data: null,
      message: "Staff member permanently deleted.",
    });
  } catch (error: any) {
    console.error("Error deleting staff member:", error);
    return res.status(500).json({ success: false, data: null, error: "Failed to delete staff member." });
  }
}