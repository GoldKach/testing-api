// // src/controllers/deposits.ts
// import { Request, Response } from "express";
// import { Prisma, $Enums } from "@prisma/client";
// import { db } from "@/db/db";

// /* ───────────────────────── helpers ───────────────────────── */

// type TxStatus = $Enums.transactionStatus;

// const Status = {
//   PENDING: "PENDING" as TxStatus,
//   COMPLETED: "COMPLETED" as TxStatus,
//   REVERSED: "REVERSED" as TxStatus,
//   FAILED: "FAILED" as TxStatus,
// } as const;

// const ALLOWED_STATUSES: TxStatus[] = [
//   Status.PENDING,
//   Status.COMPLETED,
//   Status.REVERSED,
//   Status.FAILED,
// ];

// function num(v: unknown, def = 0): number {
//   const n = typeof v === "string" ? parseFloat(v) : Number(v);
//   return Number.isFinite(n) ? n : def;
// }

// function asTxStatus(v: unknown): TxStatus | undefined {
//   if (v == null) return undefined;
//   const s = String(v).toUpperCase() as TxStatus;
//   return ALLOWED_STATUSES.includes(s) ? s : undefined;
// }

// const SORTABLE_FIELDS = new Set<keyof Prisma.DepositOrderByWithRelationInput>([
//   "createdAt",
//   "amount",
//   "transactionStatus",
// ]);

// /** Compute the wallet delta for a change in status/amount */
// function computeWalletDelta(opts: {
//   prevStatus: TxStatus;
//   nextStatus: TxStatus;
//   prevAmount: number;
//   nextAmount: number;
// }) {
//   const { prevStatus, nextStatus, prevAmount, nextAmount } = opts;

//   // non-completed → completed: credit full nextAmount
//   if (prevStatus !== Status.COMPLETED && nextStatus === Status.COMPLETED) {
//     return +nextAmount;
//   }
//   // completed → non-completed: debit full prevAmount
//   if (prevStatus === Status.COMPLETED && nextStatus !== Status.COMPLETED) {
//     return -prevAmount;
//   }
//   // completed → completed with different amount: adjust by diff
//   if (prevStatus === Status.COMPLETED && nextStatus === Status.COMPLETED) {
//     return nextAmount - prevAmount;
//   }
//   return 0;
// }

// /* ───────────────────────── list ───────────────────────── */
// /**
//  * GET /deposits
//  * Query:
//  *  - q?: string
//  *  - userId?: string
//  *  - walletId?: string
//  *  - status?: transactionStatus
//  *  - page?: number (default 1)
//  *  - pageSize?: number (default 20, max 100)
//  *  - sortBy?: "createdAt" | "amount" | "transactionStatus"
//  *  - order?: "asc" | "desc"
//  */
// export async function listDeposits(req: Request, res: Response) {
//   try {
//     const q = (req.query.q as string) || "";
//     const userId = (req.query.userId as string) || "";
//     const walletId = (req.query.walletId as string) || "";
//     const status = asTxStatus(req.query.status);

//     const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
//     const pageSize = Math.min(
//       100,
//       Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20)
//     );

//     const sortByRaw = (req.query.sortBy as string) || "createdAt";
//     const sortBy = SORTABLE_FIELDS.has(sortByRaw as any)
//       ? (sortByRaw as keyof Prisma.DepositOrderByWithRelationInput)
//       : "createdAt";
//     const order = ((req.query.order as string) === "asc" ? "asc" : "desc") as
//       | "asc"
//       | "desc";

//     const where: Prisma.DepositWhereInput = {
//       AND: [
//         userId ? { userId } : {},
//         walletId ? { walletId } : {},
//         status ? { transactionStatus: status } : {},
//         q
//           ? {
//               OR: [
//                 { referenceNo: { contains: q, mode: "insensitive" } },
//                 { mobileNo: { contains: q, mode: "insensitive" } },
//                 { AccountNo: { contains: q, mode: "insensitive" } },
//                 { description: { contains: q, mode: "insensitive" } },
//               ],
//             }
//           : {},
//       ],
//     };

//     const [total, items] = await db.$transaction([
//       db.deposit.count({ where }),
//       db.deposit.findMany({
//         where,
//         orderBy: { [sortBy]: order },
//         skip: (page - 1) * pageSize,
//         take: pageSize,
//         include: { user: true, wallet: true },
//       }),
//     ]);

//     return res.status(200).json({
//       data: items,
//       meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
//       error: null,
//     });
//   } catch (error) {
//     console.error("listDeposits error:", error);
//     return res.status(500).json({ data: null, error: "Failed to list deposits" });
//   }
// }

// /* ───────────────────────── get by id ───────────────────────── */
// /** GET /deposits/:id */
// export async function getDepositById(req: Request, res: Response) {
//   try {
//     const { id } = req.params;
//     const row = await db.deposit.findUnique({
//       where: { id },
//       include: { user: true, wallet: true },
//     });
//     if (!row) return res.status(404).json({ data: null, error: "Deposit not found" });
//     return res.status(200).json({ data: row, error: null });
//   } catch (error) {
//     console.error("getDepositById error:", error);
//     return res.status(500).json({ data: null, error: "Failed to fetch deposit" });
//   }
// }


// export async function createDeposit(req: Request, res: Response) {
//   try {
//     const {
//       walletId,
//       userId,
//       amount,
//       transactionId,
//       transactionStatus,
//       mobileNo,
//       referenceNo,
//       AccountNo,
//       ApprovedBy,
//       method,
//       description,
//     } = req.body as Partial<Prisma.DepositUncheckedCreateInput> & {
//       transactionStatus?: string;
//     };

//     const amt = num(amount, NaN);
//     if (!walletId || !userId || !Number.isFinite(amt) || amt <= 0) {
//       return res
//         .status(400)
//         .json({ data: null, error: "walletId, userId and positive amount are required" });
//     }

//     // Validate related rows exist
//     const [wallet, user] = await Promise.all([
//       db.wallet.findUnique({ where: { id: walletId } }),
//       db.user.findUnique({ where: { id: userId } }),
//     ]);
//     if (!wallet) return res.status(404).json({ data: null, error: "Wallet not found" });
//     if (!user) return res.status(404).json({ data: null, error: "User not found" });

//     const nextStatus = asTxStatus(transactionStatus) ?? Status.PENDING;

//     const created = await db.$transaction(async (tx) => {
//       const deposit = await tx.deposit.create({
//         data: {
//           walletId,
//           userId,
//           amount: amt,
//           transactionId: transactionId ?? null,
//           transactionStatus: nextStatus,
//           mobileNo: mobileNo ?? null,
//           referenceNo: referenceNo ?? null,
//           AccountNo: AccountNo ?? null,
//           ApprovedBy: ApprovedBy ?? null,
//           method: method ?? null,
//           description: description ?? null,
//         },
//       });

//       // If completed at creation, credit wallet (atomic)
//       if (nextStatus === Status.COMPLETED) {
//         await tx.wallet.update({
//           where: { id: walletId },
//           data: {
//             // change this field if your wallet uses a different one
//             netAssetValue: { increment: amt },
//           },
//         });
//       }

//       return deposit;
//     });

//     return res.status(201).json({ data: created, error: null });
//   } catch (error: any) {
//     if (error?.code === "P2002") {
//       return res
//         .status(409)
//         .json({ data: null, error: "Duplicate transactionId (already exists)" });
//     }
//     console.error("createDeposit error:", error);
//     return res.status(500).json({ data: null, error: "Failed to create deposit" });
//   }
// }

// /* ───────────────────────── update (partial) ───────────────────────── */
// /**
//  * PATCH /deposits/:id
//  * Allows changing metadata, amount, and/or status.
//  * Wallet will be adjusted if:
//  *  - status crosses into/out of COMPLETED, or
//  *  - remains COMPLETED and amount changes.
//  */
// export async function updateDeposit(req: Request, res: Response) {
//   try {
//     const { id } = req.params;

//     const existing = await db.deposit.findUnique({ where: { id } });
//     if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });

//     const {
//       amount,
//       transactionStatus,
//       transactionId,
//       mobileNo,
//       referenceNo,
//       AccountNo,
//       ApprovedBy,
//       method,
//       description,
//       walletId, // guarded
//       userId,   // guarded
//     } = req.body as Partial<Prisma.DepositUncheckedUpdateInput> & {
//       transactionStatus?: string;
//     };

//     const nextAmount = amount !== undefined ? num(amount, NaN) : existing.amount;
//     if (amount !== undefined && (!Number.isFinite(nextAmount) || nextAmount <= 0)) {
//       return res.status(400).json({ data: null, error: "amount must be a positive number" });
//     }

//     const nextStatus =
//       transactionStatus !== undefined
//         ? asTxStatus(transactionStatus) ?? existing.transactionStatus
//         : existing.transactionStatus;

//     // Prevent re-linking on completed deposits (audit safety)
//     if ((walletId || userId) && existing.transactionStatus === Status.COMPLETED) {
//       return res
//         .status(409)
//         .json({ data: null, error: "Cannot change walletId/userId for a completed deposit" });
//     }

//     const updated = await db.$transaction(async (tx) => {
//       const delta = computeWalletDelta({
//         prevStatus: existing.transactionStatus as TxStatus,
//         nextStatus,
//         prevAmount: existing.amount,
//         nextAmount,
//       });

//       const row = await tx.deposit.update({
//         where: { id },
//         data: {
//           ...(transactionId !== undefined && { transactionId }),
//           ...(amount !== undefined && { amount: nextAmount }),
//           ...(transactionStatus !== undefined && { transactionStatus: nextStatus }),
//           ...(mobileNo !== undefined && { mobileNo }),
//           ...(referenceNo !== undefined && { referenceNo }),
//           ...(AccountNo !== undefined && { AccountNo }),
//           ...(ApprovedBy !== undefined && { ApprovedBy }),
//           ...(method !== undefined && { method }),
//           ...(description !== undefined && { description }),
//         },
//       });

//       if (delta !== 0) {
//         await tx.wallet.update({
//           where: { id: existing.walletId },
//           data: {
//             netAssetValue: { increment: delta }, // atomic (negative values decrement)
//           },
//         });
//       }

//       return row;
//     });

//     return res.status(200).json({ data: updated, error: null });
//   } catch (error: any) {
//     if (error?.code === "P2002") {
//       return res
//         .status(409)
//         .json({ data: null, error: "transactionId already exists on another deposit" });
//     }
//     console.error("updateDeposit error:", error);
//     return res.status(500).json({ data: null, error: "Failed to update deposit" });
//   }
// }

// /* ───────────────────────── approve ───────────────────────── */
// /**
//  * POST /deposits/:id/approve
//  * Body: { ApprovedBy?: string }
//  */
// export async function approveDeposit(req: Request, res: Response) {
//   try {
//     const { id } = req.params;
//     const { ApprovedBy } = req.body as { ApprovedBy?: string };

//     const existing = await db.deposit.findUnique({ where: { id } });
//     if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });
//     if (existing.transactionStatus === Status.COMPLETED) {
//       return res.status(200).json({ data: existing, error: null });
//     }

//     const approved = await db.$transaction(async (tx) => {
//       const row = await tx.deposit.update({
//         where: { id },
//         data: { transactionStatus: Status.COMPLETED, ApprovedBy: ApprovedBy ?? existing.ApprovedBy },
//       });

//       await tx.wallet.update({
//         where: { id: existing.walletId },
//         data: { netAssetValue: { increment: existing.amount } },
//       });

//       return row;
//     });

//     return res.status(200).json({ data: approved, error: null });
//   } catch (error) {
//     console.error("approveDeposit error:", error);
//     return res.status(500).json({ data: null, error: "Failed to approve deposit" });
//   }
// }

// /* ───────────────────────── reverse ───────────────────────── */
// /**
//  * POST /deposits/:id/reverse
//  * If the deposit was completed, reverses its effect on the wallet.
//  */
// export async function reverseDeposit(req: Request, res: Response) {
//   try {
//     const { id } = req.params;

//     const existing = await db.deposit.findUnique({ where: { id } });
//     if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });
//     if (existing.transactionStatus === Status.REVERSED) {
//       return res.status(200).json({ data: existing, error: null });
//     }

//     const reversed = await db.$transaction(async (tx) => {
//       const row = await tx.deposit.update({
//         where: { id },
//         data: { transactionStatus: Status.REVERSED },
//       });

//       if (existing.transactionStatus === Status.COMPLETED) {
//         await tx.wallet.update({
//           where: { id: existing.walletId },
//           data: { netAssetValue: { increment: -existing.amount } },
//         });
//       }

//       return row;
//     });

//     return res.status(200).json({ data: reversed, error: null });
//   } catch (error) {
//     console.error("reverseDeposit error:", error);
//     return res.status(500).json({ data: null, error: "Failed to reverse deposit" });
//   }
// }

// /* ───────────────────────── delete ───────────────────────── */
// /**
//  * DELETE /deposits/:id
//  * Safer behavior: forbid deleting COMPLETED deposits (keep audit trail).
//  */
// export async function deleteDeposit(req: Request, res: Response) {
//   try {
//     const { id } = req.params;

//     const existing = await db.deposit.findUnique({ where: { id } });
//     if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });

//     if (existing.transactionStatus === Status.COMPLETED) {
//       return res.status(409).json({
//         data: null,
//         error: "Cannot delete a completed deposit. Reverse it first if needed.",
//       });
//     }

//     await db.deposit.delete({ where: { id } });
//     return res.status(200).json({ data: null, error: null, message: "Deposit deleted" });
//   } catch (error) {
//     console.error("deleteDeposit error:", error);
//     return res.status(500).json({ data: null, error: "Failed to delete deposit" });
//   }
// }














// src/controllers/deposits.ts
import { Request, Response } from "express";
import { Prisma, $Enums } from "@prisma/client";
import { db } from "@/db/db";

/* ───────────────────────── helpers ───────────────────────── */

type TxStatus = $Enums.TransactionStatus;

const Status = {
  PENDING: "PENDING" as TxStatus,
  APPROVED: "APPROVED" as TxStatus,
  REJECTED: "REJECTED" as TxStatus,
} as const;

const ALLOWED_STATUSES: TxStatus[] = [
  Status.PENDING,
  Status.APPROVED,
  Status.REJECTED,
];

function num(v: unknown, def = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : def;
}

function asTxStatus(v: unknown): TxStatus | undefined {
  if (v == null) return undefined;
  const s = String(v).toUpperCase() as TxStatus;
  return ALLOWED_STATUSES.includes(s) ? s : undefined;
}

const SORTABLE_FIELDS = new Set<keyof Prisma.DepositOrderByWithRelationInput>([
  "createdAt",
  "amount",
  "transactionStatus",
]);

/** Compute the wallet delta for a change in status/amount */
function computeWalletDelta(opts: {
  prevStatus: TxStatus;
  nextStatus: TxStatus;
  prevAmount: number;
  nextAmount: number;
}) {
  const { prevStatus, nextStatus, prevAmount, nextAmount } = opts;

  // non-approved → approved: credit full nextAmount
  if (prevStatus !== Status.APPROVED && nextStatus === Status.APPROVED) {
    return +nextAmount;
  }
  // approved → non-approved: debit full prevAmount
  if (prevStatus === Status.APPROVED && nextStatus !== Status.APPROVED) {
    return -prevAmount;
  }
  // approved → approved with different amount: adjust by diff
  if (prevStatus === Status.APPROVED && nextStatus === Status.APPROVED) {
    return nextAmount - prevAmount;
  }
  return 0;
}

/* ───────────────────────── list ───────────────────────── */
/**
 * GET /deposits
 * Query:
 *  - q?: string
 *  - userId?: string
 *  - walletId?: string
 *  - status?: transactionStatus (PENDING | APPROVED | REJECTED)
 *  - page?: number (default 1)
 *  - pageSize?: number (default 20, max 100)
 *  - sortBy?: "createdAt" | "amount" | "transactionStatus"
 *  - order?: "asc" | "desc"
 */
export async function listDeposits(req: Request, res: Response) {
  try {
    const q = (req.query.q as string) || "";
    const userId = (req.query.userId as string) || "";
    const walletId = (req.query.walletId as string) || "";
    const status = asTxStatus(req.query.status);

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20)
    );

    const sortByRaw = (req.query.sortBy as string) || "createdAt";
    const sortBy = SORTABLE_FIELDS.has(sortByRaw as any)
      ? (sortByRaw as keyof Prisma.DepositOrderByWithRelationInput)
      : "createdAt";
    const order = ((req.query.order as string) === "asc" ? "asc" : "desc") as
      | "asc"
      | "desc";

    const where: Prisma.DepositWhereInput = {
      AND: [
        userId ? { userId } : {},
        walletId ? { walletId } : {},
        status ? { transactionStatus: status } : {},
        q
          ? {
              OR: [
                { referenceNo: { contains: q, mode: "insensitive" } },
                { mobileNo: { contains: q, mode: "insensitive" } },
                { AccountNo: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const [total, items] = await db.$transaction([
      db.deposit.count({ where }),
      db.deposit.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: true, wallet: true },
      }),
    ]);

    return res.status(200).json({
      data: items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      error: null,
    });
  } catch (error) {
    console.error("listDeposits error:", error);
    return res.status(500).json({ data: null, error: "Failed to list deposits" });
  }
}

/* ───────────────────────── get by id ───────────────────────── */
/** GET /deposits/:id */
export async function getDepositById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const row = await db.deposit.findUnique({
      where: { id },
      include: { user: true, wallet: true },
    });
    if (!row) return res.status(404).json({ data: null, error: "Deposit not found" });
    return res.status(200).json({ data: row, error: null });
  } catch (error) {
    console.error("getDepositById error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch deposit" });
  }
}

/* ───────────────────────── create ───────────────────────── */
/**
 * POST /deposits
 * Body: { walletId, userId, amount, transactionStatus?, ... }
 */
export async function createDeposit(req: Request, res: Response) {
  try {
    const {
      walletId,
      userId,
      amount,
      transactionId,
      transactionStatus,
      mobileNo,
      referenceNo,
      AccountNo,
      ApprovedBy,
      method,
      description,
    } = req.body as Partial<Prisma.DepositUncheckedCreateInput> & {
      transactionStatus?: string;
    };

    const amt = num(amount, NaN);
    if (!walletId || !userId || !Number.isFinite(amt) || amt <= 0) {
      return res
        .status(400)
        .json({ data: null, error: "walletId, userId and positive amount are required" });
    }

    // Validate related rows exist
    const [wallet, user] = await Promise.all([
      db.wallet.findUnique({ where: { id: walletId } }),
      db.user.findUnique({ where: { id: userId } }),
    ]);
    if (!wallet) return res.status(404).json({ data: null, error: "Wallet not found" });
    if (!user) return res.status(404).json({ data: null, error: "User not found" });

    const nextStatus = asTxStatus(transactionStatus) ?? Status.PENDING;

    const created = await db.$transaction(async (tx) => {
      const deposit = await tx.deposit.create({
        data: {
          walletId,
          userId,
          amount: amt,
          transactionId: transactionId ?? null,
          transactionStatus: nextStatus,
          mobileNo: mobileNo ?? null,
          referenceNo: referenceNo ?? null,
          AccountNo: AccountNo ?? null,
          ApprovedBy: ApprovedBy ?? null,
          method: method ?? null,
          description: description ?? null,
        },
      });

      // If approved at creation, credit wallet (atomic)
      if (nextStatus === Status.APPROVED) {
        await tx.wallet.update({
          where: { id: walletId },
          data: {
            netAssetValue: { increment: amt },
          },
        });
      }

      return deposit;
    });

    return res.status(201).json({ data: created, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res
        .status(409)
        .json({ data: null, error: "Duplicate transactionId (already exists)" });
    }
    console.error("createDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to create deposit" });
  }
}

/* ───────────────────────── update (partial) ───────────────────────── */
/**
 * PATCH /deposits/:id
 * Allows changing metadata, amount, and/or status.
 * Wallet will be adjusted if:
 *  - status crosses into/out of APPROVED, or
 *  - remains APPROVED and amount changes.
 */
export async function updateDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });

    const {
      amount,
      transactionStatus,
      transactionId,
      mobileNo,
      referenceNo,
      AccountNo,
      ApprovedBy,
      method,
      description,
      walletId, // guarded
      userId,   // guarded
    } = req.body as Partial<Prisma.DepositUncheckedUpdateInput> & {
      transactionStatus?: string;
    };

    const nextAmount = amount !== undefined ? num(amount, NaN) : existing.amount;
    if (amount !== undefined && (!Number.isFinite(nextAmount) || nextAmount <= 0)) {
      return res.status(400).json({ data: null, error: "amount must be a positive number" });
    }

    const nextStatus =
      transactionStatus !== undefined
        ? asTxStatus(transactionStatus) ?? existing.transactionStatus
        : existing.transactionStatus;

    // Prevent re-linking on approved deposits (audit safety)
    if ((walletId || userId) && existing.transactionStatus === Status.APPROVED) {
      return res
        .status(409)
        .json({ data: null, error: "Cannot change walletId/userId for an approved deposit" });
    }

    const updated = await db.$transaction(async (tx) => {
      const delta = computeWalletDelta({
        prevStatus: existing.transactionStatus as TxStatus,
        nextStatus,
        prevAmount: existing.amount,
        nextAmount,
      });

      const row = await tx.deposit.update({
        where: { id },
        data: {
          ...(transactionId !== undefined && { transactionId }),
          ...(amount !== undefined && { amount: nextAmount }),
          ...(transactionStatus !== undefined && { transactionStatus: nextStatus }),
          ...(mobileNo !== undefined && { mobileNo }),
          ...(referenceNo !== undefined && { referenceNo }),
          ...(AccountNo !== undefined && { AccountNo }),
          ...(ApprovedBy !== undefined && { ApprovedBy }),
          ...(method !== undefined && { method }),
          ...(description !== undefined && { description }),
        },
      });

      if (delta !== 0) {
        await tx.wallet.update({
          where: { id: existing.walletId },
          data: {
            netAssetValue: { increment: delta }, // atomic (negative values decrement)
          },
        });
      }

      return row;
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res
        .status(409)
        .json({ data: null, error: "transactionId already exists on another deposit" });
    }
    console.error("updateDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to update deposit" });
  }
}

/* ───────────────────────── approve ───────────────────────── */
/**
 * POST /deposits/:id/approve
 * Body: { ApprovedBy?: string }
 * Changes status to APPROVED and credits wallet
//  */
// export async function approveDeposit(req: Request, res: Response) {
//   try {
//     const { id } = req.params;
//     const { ApprovedBy } = req.body as { ApprovedBy?: string };

//     const existing = await db.deposit.findUnique({ where: { id } });
//     if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });
    
//     if (existing.transactionStatus === Status.APPROVED) {
//       return res.status(200).json({ data: existing, error: null });
//     }

//     // Don't allow approving rejected deposits
//     if (existing.transactionStatus === Status.REJECTED) {
//       return res.status(409).json({ 
//         data: null, 
//         error: "Cannot approve a rejected deposit" 
//       });
//     }

//     const approved = await db.$transaction(async (tx) => {
//       const row = await tx.deposit.update({
//         where: { id },
//         data: { 
//           transactionStatus: Status.APPROVED, 
//           ApprovedBy: ApprovedBy ?? existing.ApprovedBy 
//         },
//       });

//       await tx.wallet.update({
//         where: { id: existing.walletId },
//         data: { netAssetValue: { increment: existing.amount } },
//       });

//       return row;
//     });

//     return res.status(200).json({ data: approved, error: null });
//   } catch (error) {
//     console.error("approveDeposit error:", error);
//     return res.status(500).json({ data: null, error: "Failed to approve deposit" });
//   }
// }
export async function approveDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { ApprovedBy } = req.body as { ApprovedBy?: string };

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });
    
    if (existing.transactionStatus === Status.APPROVED) {
      return res.status(200).json({ data: existing, error: null });
    }

    // Don't allow approving rejected deposits
    if (existing.transactionStatus === Status.REJECTED) {
      return res.status(409).json({ 
        data: null, 
        error: "Cannot approve a rejected deposit" 
      });
    }

    const approved = await db.$transaction(async (tx) => {
      // 1. Update deposit status
      const row = await tx.deposit.update({
        where: { id },
        data: { 
          transactionStatus: Status.APPROVED, 
          ApprovedBy: ApprovedBy ?? existing.ApprovedBy 
        },
      });

      // 2. Update wallet and get new netAssetValue
      const updatedWallet = await tx.wallet.update({
        where: { id: existing.walletId },
        data: { netAssetValue: { increment: existing.amount } },
        select: { netAssetValue: true, userId: true }
      });

      // 3. Get all user portfolios for this user with their assets
      const userPortfolios = await tx.userPortfolio.findMany({
        where: { userId: existing.userId },
        include: {
          userAssets: {
            include: {
              portfolioAsset: {
                include: {
                  asset: {
                    select: {
                      id: true,
                      symbol: true,
                      allocationPercentage: true,
                      costPerShare: true,
                      closePrice: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // 4. Update each UserPortfolioAsset with recalculated values
      for (const userPortfolio of userPortfolios) {
        let totalPortfolioValue = 0;

        for (const userAsset of userPortfolio.userAssets) {
          const asset = userAsset.portfolioAsset.asset;
          
          // Calculate based on schema formulas:
          // costPrice = asset.allocPercent × user.wallet.netAssetValue
          const newCostPrice = (asset.allocationPercentage / 100) * updatedWallet.netAssetValue;
          
          // stock = costPrice ÷ asset.costPerShare
          const newStock = asset.costPerShare > 0 ? newCostPrice / asset.costPerShare : 0;
          
          // closeValue = asset.closePrice × stock
          const newCloseValue = asset.closePrice * newStock;
          
          // lossGain = closeValue - costPrice
          const newLossGain = newCloseValue - newCostPrice;

          // Update the UserPortfolioAsset
          await tx.userPortfolioAsset.update({
            where: { id: userAsset.id },
            data: {
              costPrice: newCostPrice,
              stock: newStock,
              closeValue: newCloseValue,
              lossGain: newLossGain,
            }
          });

          totalPortfolioValue += newCloseValue;
        }

        // 5. Update UserPortfolio.portfolioValue (sum of all closeValues)
        await tx.userPortfolio.update({
          where: { id: userPortfolio.id },
          data: { portfolioValue: totalPortfolioValue }
        });
      }

      return row;
    });

    return res.status(200).json({ data: approved, error: null });
  } catch (error) {
    console.error("approveDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to approve deposit" });
  }
}

/* ───────────────────────── reject ───────────────────────── */
/**
 * POST /deposits/:id/reject
 * Changes status to REJECTED (no wallet impact)
 */
export async function rejectDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });
    
    if (existing.transactionStatus === Status.REJECTED) {
      return res.status(200).json({ data: existing, error: null });
    }

    // Don't allow rejecting approved deposits without reversal
    if (existing.transactionStatus === Status.APPROVED) {
      return res.status(409).json({ 
        data: null, 
        error: "Cannot reject an approved deposit. Use reversal instead." 
      });
    }

    const rejected = await db.deposit.update({
      where: { id },
      data: { transactionStatus: Status.REJECTED },
    });

    return res.status(200).json({ data: rejected, error: null });
  } catch (error) {
    console.error("rejectDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to reject deposit" });
  }
}

/* ───────────────────────── reverse (for approved deposits) ───────────────────────── */
/**
 * POST /deposits/:id/reverse
 * If the deposit was approved, reverses its effect on the wallet and changes to REJECTED
 */
export async function reverseDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });
    
    if (existing.transactionStatus === Status.REJECTED) {
      return res.status(200).json({ data: existing, error: null });
    }

    const reversed = await db.$transaction(async (tx) => {
      const row = await tx.deposit.update({
        where: { id },
        data: { transactionStatus: Status.REJECTED },
      });

      // Only debit wallet if it was previously approved
      if (existing.transactionStatus === Status.APPROVED) {
        await tx.wallet.update({
          where: { id: existing.walletId },
          data: { netAssetValue: { increment: -existing.amount } },
        });
      }

      return row;
    });

    return res.status(200).json({ data: reversed, error: null });
  } catch (error) {
    console.error("reverseDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to reverse deposit" });
  }
}

/* ───────────────────────── delete ───────────────────────── */
/**
 * DELETE /deposits/:id
 * Safer behavior: forbid deleting APPROVED deposits (keep audit trail).
 */
export async function deleteDeposit(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const existing = await db.deposit.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ data: null, error: "Deposit not found" });

    if (existing.transactionStatus === Status.APPROVED) {
      return res.status(409).json({
        data: null,
        error: "Cannot delete an approved deposit. Reverse it first if needed.",
      });
    }

    await db.deposit.delete({ where: { id } });
    return res.status(200).json({ data: null, error: null, message: "Deposit deleted" });
  } catch (error) {
    console.error("deleteDeposit error:", error);
    return res.status(500).json({ data: null, error: "Failed to delete deposit" });
  }
}
