import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/db/db";

// Defined locally to avoid prisma generate dependency at edit-time
export type AuditTransactionType =
  | "DEPOSIT_CREATED"
  | "DEPOSIT_APPROVED"
  | "DEPOSIT_REJECTED"
  | "DEPOSIT_REVERSED"
  | "WITHDRAWAL_CREATED"
  | "WITHDRAWAL_APPROVED"
  | "WITHDRAWAL_REJECTED"
  | "REDEMPTION_CREATED"
  | "REDEMPTION_APPROVED"
  | "REDEMPTION_REJECTED"
  | "PORTFOLIO_ALLOCATION"
  | "FEE_DEDUCTED"
  | "CLOSE_PRICE_UPDATED";

export type AuditTransactionStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVERSED";

export interface AuditLogEntry {
  transactionType: AuditTransactionType;
  transactionId?: string;
  transactionStatus: AuditTransactionStatus;
  userId: string;
  userName?: string;
  userEmail?: string;
  performedById?: string;
  performedByName?: string;
  performedByRole?: string;
  amount?: number;
  currency?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogRow {
  id: string;
  sequence: number;
  transactionType: AuditTransactionType;
  transactionId: string | null;
  transactionStatus: AuditTransactionStatus;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  performedById: string | null;
  performedByName: string | null;
  performedByRole: string | null;
  amount: number | null;
  currency: string;
  description: string | null;
  metadata: Prisma.JsonValue;
  hash: string;
  previousHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  systemVersion: string;
  createdAt: Date;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalRows: number;
  firstBrokenSequence: number | null;
  brokenAt: string | null;
  checkedAt: Date;
}

export class TransactionAuditLogger {
  private readonly systemVersion: string;

  constructor(systemVersion = "1.0.0") {
    this.systemVersion = systemVersion;
  }

  private computeHash(fields: {
    previousHash: string;
    id: string;
    sequence: number;
    transactionType: string;
    transactionId: string | null;
    transactionStatus: string;
    userId: string;
    amount: number | null;
    currency: string;
    systemVersion: string;
    createdAt: string;
  }): string {
    const payload = [
      fields.previousHash,
      fields.id,
      String(fields.sequence),
      fields.transactionType,
      fields.transactionId ?? "",
      fields.transactionStatus,
      fields.userId,
      fields.amount != null ? String(fields.amount) : "",
      fields.currency,
      fields.systemVersion,
      fields.createdAt,
    ].join("|");
    return crypto.createHash("sha256").update(payload).digest("hex");
  }

  async log(
    entry: AuditLogEntry,
    tx?: Prisma.TransactionClient
  ): Promise<AuditLogRow> {
    const client = tx ?? db;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditClient = (client as any).transactionAuditLog as any;

    // Fetch the last row to get the previous hash and sequence
    const lastRows = await auditClient.findMany({
      orderBy: { sequence: "desc" },
      take: 1,
      select: { hash: true, sequence: true },
    }) as Array<{ hash: string; sequence: number }>;

    const previousHash = lastRows.length > 0 ? lastRows[0].hash : "GENESIS";
    const nextSequence = lastRows.length > 0 ? lastRows[0].sequence + 1 : 1;

    const id = crypto.randomUUID();
    const createdAt = new Date();

    const hash = this.computeHash({
      previousHash,
      id,
      sequence: nextSequence,
      transactionType: entry.transactionType,
      transactionId: entry.transactionId ?? null,
      transactionStatus: entry.transactionStatus,
      userId: entry.userId,
      amount: entry.amount ?? null,
      currency: entry.currency ?? "USD",
      systemVersion: this.systemVersion,
      createdAt: createdAt.toISOString(),
    });

    const row = await auditClient.create({
      data: {
        id,
        sequence: nextSequence,
        transactionType: entry.transactionType,
        transactionId: entry.transactionId,
        transactionStatus: entry.transactionStatus,
        userId: entry.userId,
        userName: entry.userName,
        userEmail: entry.userEmail,
        performedById: entry.performedById,
        performedByName: entry.performedByName,
        performedByRole: entry.performedByRole,
        amount: entry.amount,
        currency: entry.currency ?? "USD",
        description: entry.description,
        metadata: entry.metadata as Prisma.InputJsonValue,
        hash,
        previousHash,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        systemVersion: this.systemVersion,
        createdAt,
      },
    });

    return row as unknown as AuditLogRow;
  }

  async verifyChainIntegrity(): Promise<ChainVerificationResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auditTable = (db as any).transactionAuditLog as any;
    const rows = await auditTable.findMany({
      orderBy: { sequence: "asc" },
      select: {
        id: true,
        sequence: true,
        transactionType: true,
        transactionId: true,
        transactionStatus: true,
        userId: true,
        amount: true,
        currency: true,
        systemVersion: true,
        createdAt: true,
        hash: true,
        previousHash: true,
      },
    }) as Array<{
      id: string;
      sequence: number;
      transactionType: string;
      transactionId: string | null;
      transactionStatus: string;
      userId: string;
      amount: number | null;
      currency: string;
      systemVersion: string;
      createdAt: Date;
      hash: string;
      previousHash: string;
    }>;

    let expectedPreviousHash = "GENESIS";

    for (const row of rows) {
      const expected = this.computeHash({
        previousHash: expectedPreviousHash,
        id: row.id,
        sequence: row.sequence,
        transactionType: row.transactionType,
        transactionId: row.transactionId,
        transactionStatus: row.transactionStatus,
        userId: row.userId,
        amount: row.amount,
        currency: row.currency,
        systemVersion: row.systemVersion,
        createdAt: row.createdAt.toISOString(),
      });

      if (expected !== row.hash || row.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          totalRows: rows.length,
          firstBrokenSequence: row.sequence,
          brokenAt: row.id,
          checkedAt: new Date(),
        };
      }

      expectedPreviousHash = row.hash;
    }

    return {
      valid: true,
      totalRows: rows.length,
      firstBrokenSequence: null,
      brokenAt: null,
      checkedAt: new Date(),
    };
  }
}

export const auditLogger = new TransactionAuditLogger(
  process.env.SYSTEM_VERSION ?? "1.0.0"
);
