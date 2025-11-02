// src/controllers/withdrawals.ts
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { db } from "@/db/db";

/* --------------------------------- helpers --------------------------------- */

type TxStatus = "PENDING" | "APPROVED" | "REJECTED";

function asStatus(v: any): TxStatus | undefined {
  const s = String(v || "").toUpperCase();
  if (s === "PENDING" || s === "APPROVED" || s === "REJECTED") return s;
  return undefined;
}

function num(v: any, def = 0): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : def;
}

function parseIncludeParam(raw?: string) {
  // supports ?include=user,wallet
  const inc = (raw || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const include: Prisma.WithdrawalInclude = {};
  if (inc.includes("user")) include.user = true;
  if (inc.includes("wallet")) include.wallet = true;
  return include;
}

const SORTABLE_FIELDS = new Set<keyof Prisma.WithdrawalOrderByWithRelationInput>([
  "createdAt",
  "amount",
  "transactionStatus",
  "updatedAt",
]);

/* ---------------------------------- LIST ----------------------------------- */
/**
 * GET /withdrawals
 * Query:
 *  - q?: string (search referenceNo, method, bankName, AccountNo/AccountName)
 *  - userId?: string
 *  - walletId?: string
 *  - status?: PENDING|APPROVED|REJECTED
 *  - page?: number (default 1)
 *  - pageSize?: number (default 20, max 100)
 *  - sortBy?: createdAt|amount|transactionStatus|updatedAt
 *  - order?: asc|desc
 *  - include?: "user,wallet"
 */
export async function listWithdrawals(req: Request, res: Response) {
  try {
    const q = (req.query.q as string) || "";
    const userId = (req.query.userId as string) || "";
    const walletId = (req.query.walletId as string) || "";
    const status = asStatus(req.query.status);
    const include = parseIncludeParam(req.query.include as string | undefined);

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

    const sortByRaw = (req.query.sortBy as string) || "createdAt";
    const sortBy = SORTABLE_FIELDS.has(sortByRaw as any) ? (sortByRaw as any) : "createdAt";
    const order = ((req.query.order as string) === "asc" ? "asc" : "desc") as "asc" | "desc";

    const where: Prisma.WithdrawalWhereInput = {
      AND: [
        userId ? { userId } : {},
        walletId ? { walletId } : {},
        status ? { transactionStatus: status } : {},
        q
          ? {
              OR: [
                { referenceNo: { contains: q, mode: "insensitive" } },
                { method: { contains: q, mode: "insensitive" } },
                { bankName: { contains: q, mode: "insensitive" } },
                { AccountNo: { contains: q, mode: "insensitive" } },
                { AccountName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const [total, items] = await db.$transaction([
      db.withdrawal.count({ where }),
      db.withdrawal.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: Object.keys(include).length ? include : undefined,
      }),
    ]);

    return res.status(200).json({
      data: items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      error: null,
    });
  } catch (error) {
    console.error("listWithdrawals error:", error);
    return res.status(500).json({ data: null, error: "Failed to list withdrawals" });
  }
}

/* ----------------------------------- GET ----------------------------------- */
/** GET /withdrawals/:id  (supports ?include=user,wallet) */
export async function getWithdrawalById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const include = parseIncludeParam(req.query.include as string | undefined);

    const row = await db.withdrawal.findUnique({
      where: { id },
      include: Object.keys(include).length ? include : undefined,
    });
    if (!row) return res.status(404).json({ data: null, error: "Withdrawal not found" });

    return res.status(200).json({ data: row, error: null });
  } catch (error) {
    console.error("getWithdrawalById error:", error);
    return res.status(500).json({ data: null, error: "Failed to fetch withdrawal" });
  }
}

/* -------------------------------- CREATE ----------------------------------- */
/** POST /withdrawals
 * Body: {
 *   walletId, userId, amount, referenceNo, bankName, bankAccountName, bankBranch,
 *   transactionId?, method?, AccountNo?, AccountName?, description?
 * }
 * - Creates PENDING withdrawal request (no wallet deduction yet)
 */
export async function createWithdrawal(req: Request, res: Response) {
  try {
    const {
      walletId,
      userId,
      amount,
      referenceNo,
      transactionId,
      transactionStatus, // optional, default PENDING
      method,
      AccountNo,
      AccountName,
      bankName,
      bankAccountName,
      bankBranch,
      description,
    } = req.body as Partial<{
      walletId: string;
      userId: string;
      amount: number | string;
      referenceNo: string;
      transactionId?: string | null;
      transactionStatus?: string;
      method?: string | null;
      AccountNo?: string | null;
      AccountName?: string | null;
      bankName: string;
      bankAccountName: string;
      bankBranch: string;
      description?: string | null;
    }>;

    const amt = num(amount, NaN);
    if (!walletId || !userId || !referenceNo || !bankName || !bankAccountName || !bankBranch || !Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({
        data: null,
        error: "walletId, userId, referenceNo, bankName, bankAccountName, bankBranch and positive amount are required",
      });
    }

    const desired: TxStatus = asStatus(transactionStatus) ?? "PENDING";
    if (desired !== "PENDING") {
      return res.status(400).json({ data: null, error: "New withdrawals must start in PENDING state" });
    }

    // light existence checks
    const [user, wallet] = await db.$transaction([
      db.user.findUnique({ where: { id: userId }, select: { id: true } }),
      db.wallet.findUnique({ where: { id: walletId }, select: { id: true } }),
    ]);
    if (!user) return res.status(404).json({ data: null, error: "User not found" });
    if (!wallet) return res.status(404).json({ data: null, error: "Wallet not found" });

    const created = await db.withdrawal.create({
      data: {
        walletId,
        userId,
        amount: amt,
        referenceNo,
        transactionId: transactionId ?? null,
        transactionStatus: "PENDING",
        method: method ?? null,
        AccountNo: AccountNo ?? null,
        AccountName: AccountName ?? null,
        bankName,
        bankAccountName,
        bankBranch,
        description: description ?? null,
      },
    });

    return res.status(201).json({ data: created, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      // unique on transactionId
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("createWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to create withdrawal" });
  }
}

/* -------------------------------- UPDATE ----------------------------------- */
/** PATCH /withdrawals/:id
 * Only allowed while PENDING. Update editable fields.
 */
export async function updateWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const exists = await db.withdrawal.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ data: null, error: "Withdrawal not found" });
    if (exists.transactionStatus !== "PENDING") {
      return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be updated" });
    }

    const {
      amount,
      transactionId,
      method,
      AccountNo,
      AccountName,
      bankName,
      bankAccountName,
      bankBranch,
      description,
      transactionStatus,
    } = req.body as Partial<{
      amount: number | string;
      transactionId?: string | null;
      method?: string | null;
      AccountNo?: string | null;
      AccountName?: string | null;
      bankName?: string;
      bankAccountName?: string;
      bankBranch?: string;
      description?: string | null;
      transactionStatus?: string;
    }>;

    if (transactionStatus && asStatus(transactionStatus) !== "PENDING") {
      return res.status(400).json({ data: null, error: "Use approve/reject endpoints to change status" });
    }

    const data: Prisma.WithdrawalUpdateInput = {};
    if (amount !== undefined) {
      const a = num(amount, NaN);
      if (!Number.isFinite(a) || a <= 0) return res.status(400).json({ data: null, error: "amount must be > 0" });
      data.amount = a;
    }
    if (transactionId !== undefined) data.transactionId = transactionId; // can be null
    if (method !== undefined) data.method = method;
    if (AccountNo !== undefined) data.AccountNo = AccountNo;
    if (AccountName !== undefined) data.AccountName = AccountName;
    if (bankName !== undefined) data.bankName = bankName;
    if (bankAccountName !== undefined) data.bankAccountName = bankAccountName;
    if (bankBranch !== undefined) data.bankBranch = bankBranch;
    if (description !== undefined) data.description = description;

    const updated = await db.withdrawal.update({ where: { id }, data });
    return res.status(200).json({ data: updated, error: null });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("updateWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to update withdrawal" });
  }
}

/* -------------------------------- APPROVE ---------------------------------- */
/** POST /withdrawals/:id/approve
 * Body: { transactionId?: string }
 * - Moves PENDING -> APPROVED
 * - Deducts wallet.netAssetValue by amount in a single transaction
 * - Validates sufficient balance
 */
export async function approveWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { transactionId } = req.body as { transactionId?: string | null };

    const result = await db.$transaction(async (tx) => {
      const row = await tx.withdrawal.findUnique({ where: { id }, include: { wallet: true } });
      if (!row) throw new Error("NOT_FOUND");
      if (row.transactionStatus !== "PENDING") throw new Error("NOT_PENDING");

      const wallet = await tx.wallet.findUnique({ where: { id: row.walletId } });
      if (!wallet) throw new Error("WALLET_NOT_FOUND");

      const balance = num((wallet as any).netAssetValue, NaN);
      if (!Number.isFinite(balance)) throw new Error("WALLET_BALANCE_INVALID");
      if (balance < row.amount) throw new Error("INSUFFICIENT_FUNDS");

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { netAssetValue: balance - row.amount },
      });

      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id },
        data: {
          transactionStatus: "APPROVED",
          ...(transactionId !== undefined ? { transactionId } : {}),
        },
      });

      return updatedWithdrawal;
    });

    return res.status(200).json({ data: result, error: null });
  } catch (error: any) {
    const msg = String(error?.message || "");
    if (msg === "NOT_FOUND") return res.status(404).json({ data: null, error: "Withdrawal not found" });
    if (msg === "NOT_PENDING") return res.status(409).json({ data: null, error: "Only PENDING can be approved" });
    if (msg === "WALLET_NOT_FOUND") return res.status(404).json({ data: null, error: "Wallet not found" });
    if (msg === "WALLET_BALANCE_INVALID") return res.status(500).json({ data: null, error: "Wallet balance invalid" });
    if (msg === "INSUFFICIENT_FUNDS") return res.status(400).json({ data: null, error: "Insufficient wallet balance" });

    if (error?.code === "P2002") {
      return res.status(409).json({ data: null, error: "Duplicate transactionId" });
    }
    console.error("approveWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to approve withdrawal" });
  }
}

/* -------------------------------- REJECT ----------------------------------- */
/** POST /withdrawals/:id/reject
 * - Moves PENDING -> REJECTED
 * - No wallet changes
 */
export async function rejectWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const row = await db.withdrawal.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ data: null, error: "Withdrawal not found" });
    if (row.transactionStatus !== "PENDING") {
      return res.status(409).json({ data: null, error: "Only PENDING can be rejected" });
    }

    const updated = await db.withdrawal.update({
      where: { id },
      data: { transactionStatus: "REJECTED" },
    });

    return res.status(200).json({ data: updated, error: null });
  } catch (error) {
    console.error("rejectWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to reject withdrawal" });
  }
}

/* -------------------------------- DELETE ----------------------------------- */
/** DELETE /withdrawals/:id
 * Only allowed while PENDING
 */
export async function deleteWithdrawal(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const exists = await db.withdrawal.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ data: null, error: "Withdrawal not found" });
    if (exists.transactionStatus !== "PENDING") {
      return res.status(409).json({ data: null, error: "Only PENDING withdrawals can be deleted" });
    }

    await db.withdrawal.delete({ where: { id } });
    return res.status(200).json({ data: null, error: null, message: "Withdrawal deleted" });
  } catch (error) {
    console.error("deleteWithdrawal error:", error);
    return res.status(500).json({ data: null, error: "Failed to delete withdrawal" });
  }
}
