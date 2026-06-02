import { Router, Response } from "express";
import { authenticateToken, AuthRequest } from "@/utils/auth";
import { auditLogger } from "@/audit/transactionAuditLogger";
import { db } from "@/db/db";

const auditLogsRouter = Router();

// ── GET /api/v1/compliance/audit-logs ─────────────────────────────────────────
// Query params: page, pageSize, userId, transactionType, transactionStatus,
//               startDate, endDate, search
auditLogsRouter.get(
  "/compliance/audit-logs",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page = "1",
        pageSize = "50",
        userId,
        transactionType,
        transactionStatus,
        startDate,
        endDate,
        search,
      } = req.query as Record<string, string | undefined>;

      const take = Math.min(Number(pageSize) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = {};

      if (userId) where.userId = userId;
      if (transactionType) where.transactionType = transactionType;
      if (transactionStatus) where.transactionStatus = transactionStatus;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      if (search) {
        where.OR = [
          { userName: { contains: search, mode: "insensitive" } },
          { userEmail: { contains: search, mode: "insensitive" } },
          { transactionId: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { performedByName: { contains: search, mode: "insensitive" } },
        ];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const auditTable = (db as any).transactionAuditLog as any;
      const [total, rows] = await Promise.all([
        auditTable.count({ where }),
        auditTable.findMany({
          where,
          orderBy: { sequence: "desc" },
          skip,
          take,
        }),
      ]) as [number, unknown[]];

      res.json({
        data: {
          rows,
          total,
          page: Math.max(Number(page) || 1, 1),
          pageSize: take,
          totalPages: Math.ceil(total / take),
        },
        error: null,
      });
    } catch (err) {
      console.error("[audit-logs] list error", err);
      res.status(500).json({ data: null, error: "Failed to fetch audit logs" });
    }
  }
);

// ── GET /api/v1/compliance/audit-logs/verify-integrity ────────────────────────
auditLogsRouter.get(
  "/compliance/audit-logs/verify-integrity",
  authenticateToken,
  async (_req: AuthRequest, res: Response) => {
    try {
      const result = await auditLogger.verifyChainIntegrity();
      res.json({ data: result, error: null });
    } catch (err) {
      console.error("[audit-logs] verify error", err);
      res
        .status(500)
        .json({ data: null, error: "Failed to verify chain integrity" });
    }
  }
);

// ── GET /api/v1/compliance/audit-logs/export ──────────────────────────────────
// Returns CSV; same filters as list endpoint
auditLogsRouter.get(
  "/compliance/audit-logs/export",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        userId,
        transactionType,
        transactionStatus,
        startDate,
        endDate,
        search,
      } = req.query as Record<string, string | undefined>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = {};

      if (userId) where.userId = userId;
      if (transactionType) where.transactionType = transactionType;
      if (transactionStatus) where.transactionStatus = transactionStatus;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }
      if (search) {
        where.OR = [
          { userName: { contains: search, mode: "insensitive" } },
          { userEmail: { contains: search, mode: "insensitive" } },
          { transactionId: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { performedByName: { contains: search, mode: "insensitive" } },
        ];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exportTable = (db as any).transactionAuditLog as any;
      const rows = await exportTable.findMany({
        where,
        orderBy: { sequence: "asc" },
      }) as Array<{
        sequence: number; id: string; transactionType: string; transactionId: string | null;
        transactionStatus: string; userId: string; userName: string | null; userEmail: string | null;
        performedByName: string | null; performedByRole: string | null; amount: number | null;
        currency: string; description: string | null; ipAddress: string | null;
        hash: string; previousHash: string; systemVersion: string; createdAt: Date;
      }>;

      const NAIROBI_OFFSET = 3 * 60 * 60 * 1000; // UTC+3

      const toNairobi = (d: Date) =>
        new Date(d.getTime() + NAIROBI_OFFSET)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);

      const csvEscape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const headers = [
        "sequence",
        "id",
        "transactionType",
        "transactionId",
        "transactionStatus",
        "userId",
        "userName",
        "userEmail",
        "performedByName",
        "performedByRole",
        "amount",
        "currency",
        "description",
        "ipAddress",
        "hash",
        "previousHash",
        "systemVersion",
        "createdAt (Africa/Nairobi)",
      ];

      const lines = [
        headers.join(","),
        ...rows.map((r) =>
          [
            r.sequence,
            r.id,
            r.transactionType,
            r.transactionId ?? "",
            r.transactionStatus,
            r.userId,
            r.userName ?? "",
            r.userEmail ?? "",
            r.performedByName ?? "",
            r.performedByRole ?? "",
            r.amount ?? "",
            r.currency,
            r.description ?? "",
            r.ipAddress ?? "",
            r.hash,
            r.previousHash,
            r.systemVersion,
            toNairobi(r.createdAt),
          ]
            .map(csvEscape)
            .join(",")
        ),
      ];

      const csv = lines.join("\r\n");
      const timestamp = new Date().toISOString().slice(0, 10);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-log-${timestamp}.csv"`
      );
      res.send(csv);
    } catch (err) {
      console.error("[audit-logs] export error", err);
      res.status(500).json({ data: null, error: "Failed to export audit logs" });
    }
  }
);

// ── GET /api/v1/compliance/audit-logs/:id ─────────────────────────────────────
auditLogsRouter.get(
  "/compliance/audit-logs/:id",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byIdTable = (db as any).transactionAuditLog as any;
      const row = await byIdTable.findUnique({
        where: { id: req.params.id },
      });
      if (!row) {
        return res
          .status(404)
          .json({ data: null, error: "Audit log entry not found" });
      }
      res.json({ data: row, error: null });
    } catch (err) {
      console.error("[audit-logs] getById error", err);
      res.status(500).json({ data: null, error: "Failed to fetch audit log" });
    }
  }
);

// ── GET /api/v1/compliance/audit-report-data ─────────────────────────────────
// Returns login sessions, deposits, and withdrawals for PDF report generation.
// Query params: startDate, endDate, include (comma-separated: sessions,deposits,withdrawals)
auditLogsRouter.get(
  "/compliance/audit-report-data",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { startDate, endDate, include = "sessions,deposits,withdrawals" } =
        req.query as Record<string, string | undefined>;

      const sections = (include ?? "sessions,deposits,withdrawals")
        .split(",")
        .map((s) => s.trim().toLowerCase());

      const dateFilter =
        startDate || endDate
          ? {
              createdAt: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate) } : {}),
              },
            }
          : {};

      const [loginSessions, deposits, withdrawals] = await Promise.all([
        sections.includes("sessions")
          ? db.refreshToken.findMany({
              where: dateFilter,
              orderBy: { createdAt: "desc" },
              take: 500,
              select: {
                id: true,
                createdAt: true,
                expiresAt: true,
                revoked: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true,
                  },
                },
              },
            })
          : Promise.resolve([]),

        sections.includes("deposits")
          ? db.deposit.findMany({
              where: dateFilter,
              orderBy: { createdAt: "desc" },
              take: 500,
              select: {
                id: true,
                amount: true,
                depositTarget: true,
                transactionStatus: true,
                transactionId: true,
                method: true,
                description: true,
                approvedByName: true,
                approvedAt: true,
                rejectedByName: true,
                rejectedAt: true,
                rejectReason: true,
                createdByName: true,
                createdAt: true,
                bankCost: true,
                transactionCost: true,
                cashAtBank: true,
                totalFees: true,
                isFirstDeposit: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            })
          : Promise.resolve([]),

        sections.includes("withdrawals")
          ? db.withdrawal.findMany({
              where: dateFilter,
              orderBy: { createdAt: "desc" },
              take: 500,
              select: {
                id: true,
                amount: true,
                withdrawalType: true,
                transactionStatus: true,
                transactionId: true,
                bankName: true,
                bankBranch: true,
                description: true,
                approvedByName: true,
                approvedAt: true,
                rejectedByName: true,
                rejectedAt: true,
                rejectReason: true,
                createdByName: true,
                createdAt: true,
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);

      res.json({
        data: { loginSessions, deposits, withdrawals },
        error: null,
      });
    } catch (err) {
      console.error("[audit-report-data] error", err);
      res
        .status(500)
        .json({ data: null, error: "Failed to fetch audit report data" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// GENERAL AUDIT LOG  (AuditLog table — auth events, KYC, admin actions)
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/v1/compliance/general-audit-logs ─────────────────────────────────
// Query: page, pageSize, actorId, entityType, entityId, eventType,
//        status, startDate, endDate, search
auditLogsRouter.get(
  "/compliance/general-audit-logs",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page = "1",
        pageSize = "50",
        actorId,
        entityType,
        entityId,
        eventType,
        status,
        startDate,
        endDate,
        search,
      } = req.query as Record<string, string | undefined>;

      const take = Math.min(Number(pageSize) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = {};
      if (actorId)    where.actorId    = actorId;
      if (entityType) where.entityType = entityType;
      if (entityId)   where.entityId   = entityId;
      if (eventType)  where.eventType  = eventType;
      if (status)     where.status     = status;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)   where.createdAt.lte = new Date(endDate);
      }

      if (search) {
        where.OR = [
          { action:      { contains: search, mode: "insensitive" } },
          { actorName:   { contains: search, mode: "insensitive" } },
          { actorEmail:  { contains: search, mode: "insensitive" } },
          { entityId:    { contains: search, mode: "insensitive" } },
          { ipAddress:   { contains: search, mode: "insensitive" } },
        ];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (db as any).auditLog as any;
      const [total, rows] = await Promise.all([
        table.count({ where }),
        table.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
      ]) as [number, unknown[]];

      res.json({
        data: {
          rows,
          total,
          page: Math.max(Number(page) || 1, 1),
          pageSize: take,
          totalPages: Math.ceil(total / take),
        },
        error: null,
      });
    } catch (err) {
      console.error("[general-audit-logs] error", err);
      res.status(500).json({ data: null, error: "Failed to fetch general audit logs" });
    }
  }
);

// ── GET /api/v1/compliance/general-audit-logs/export ──────────────────────────
auditLogsRouter.get(
  "/compliance/general-audit-logs/export",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const { actorId, entityType, entityId, eventType, startDate, endDate } =
        req.query as Record<string, string | undefined>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = {};
      if (actorId)    where.actorId    = actorId;
      if (entityType) where.entityType = entityType;
      if (entityId)   where.entityId   = entityId;
      if (eventType)  where.eventType  = eventType;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)   where.createdAt.lte = new Date(endDate);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await (db as any).auditLog.findMany({
        where,
        orderBy: { timestamp: "asc" },
        take: 10_000,
      }) as Array<Record<string, unknown>>;

      const headers = [
        "id","timestamp","eventType","action","entityType","entityId",
        "actorId","actorType","actorRole","actorName","actorEmail",
        "ipAddress","status","errorMessage","createdAt",
      ];

      const csvEscape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };

      const lines = [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
      ];

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="general-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send(lines.join("\r\n"));

      // Log the export action itself
      const { auditService } = await import("@/audit/auditService");
      auditService.logAudit({
        eventType:  "DATA_EXPORTED",
        action:     `General audit log exported (${rows.length} rows)`,
        actorId:    req.user?.userId,
        actorRole:  req.user?.role,
        actorType:  "STAFF",
        status:     "SUCCESS",
        metadata:   { rowCount: rows.length, filters: { actorId, entityType, eventType, startDate, endDate } },
      });
    } catch (err) {
      console.error("[general-audit-logs/export] error", err);
      res.status(500).json({ data: null, error: "Failed to export general audit logs" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// SECURITY LOG
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/v1/compliance/security-logs ─────────────────────────────────────
auditLogsRouter.get(
  "/compliance/security-logs",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page = "1",
        pageSize = "50",
        userId,
        eventType,
        riskLevel,
        ipAddress,
        resolved,
        startDate,
        endDate,
      } = req.query as Record<string, string | undefined>;

      const take = Math.min(Number(pageSize) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = {};
      if (userId)    where.userId    = userId;
      if (eventType) where.eventType = eventType;
      if (riskLevel) where.riskLevel = riskLevel;
      if (ipAddress) where.ipAddress = ipAddress;
      if (resolved !== undefined) where.resolved = resolved === "true";
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)   where.createdAt.lte = new Date(endDate);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (db as any).securityLog as any;
      const [total, rows] = await Promise.all([
        table.count({ where }),
        table.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
      ]) as [number, unknown[]];

      res.json({
        data: { rows, total, page: Math.max(Number(page) || 1, 1), pageSize: take, totalPages: Math.ceil(total / take) },
        error: null,
      });
    } catch (err) {
      console.error("[security-logs] error", err);
      res.status(500).json({ data: null, error: "Failed to fetch security logs" });
    }
  }
);

// ── GET /api/v1/compliance/security-logs/summary ─────────────────────────────
// Aggregated risk-level counts for a dashboard widget
auditLogsRouter.get(
  "/compliance/security-logs/summary",
  authenticateToken,
  async (_req: AuthRequest, res: Response) => {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (db as any).securityLog as any;

      const [critical, high, medium, low, unresolved] = await Promise.all([
        table.count({ where: { riskLevel: "CRITICAL", createdAt: { gte: since } } }),
        table.count({ where: { riskLevel: "HIGH",     createdAt: { gte: since } } }),
        table.count({ where: { riskLevel: "MEDIUM",   createdAt: { gte: since } } }),
        table.count({ where: { riskLevel: "LOW",      createdAt: { gte: since } } }),
        table.count({ where: { resolved: false } }),
      ]) as number[];

      res.json({
        data: { since, critical, high, medium, low, unresolved },
        error: null,
      });
    } catch (err) {
      console.error("[security-logs/summary] error", err);
      res.status(500).json({ data: null, error: "Failed to fetch security log summary" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// API LOG
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/v1/compliance/api-logs ─────────────────────────────────────────
auditLogsRouter.get(
  "/compliance/api-logs",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page = "1",
        pageSize = "50",
        userId,
        method,
        endpoint,
        statusCode,
        startDate,
        endDate,
      } = req.query as Record<string, string | undefined>;

      const take = Math.min(Number(pageSize) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = {};
      if (userId)     where.userId     = userId;
      if (method)     where.method     = method.toUpperCase();
      if (endpoint)   where.endpoint   = { contains: endpoint, mode: "insensitive" };
      if (statusCode) where.statusCode = Number(statusCode);
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)   where.createdAt.lte = new Date(endDate);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (db as any).apiLog as any;
      const [total, rows] = await Promise.all([
        table.count({ where }),
        table.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
      ]) as [number, unknown[]];

      res.json({
        data: { rows, total, page: Math.max(Number(page) || 1, 1), pageSize: take, totalPages: Math.ceil(total / take) },
        error: null,
      });
    } catch (err) {
      console.error("[api-logs] error", err);
      res.status(500).json({ data: null, error: "Failed to fetch API logs" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM LOG
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/v1/compliance/system-logs ───────────────────────────────────────
auditLogsRouter.get(
  "/compliance/system-logs",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        page = "1",
        pageSize = "50",
        eventType,
        component,
        severity,
        startDate,
        endDate,
      } = req.query as Record<string, string | undefined>;

      const take = Math.min(Number(pageSize) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: Record<string, any> = {};
      if (eventType) where.eventType = eventType;
      if (component) where.component = { contains: component, mode: "insensitive" };
      if (severity)  where.severity  = severity;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate)   where.createdAt.lte = new Date(endDate);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (db as any).systemLog as any;
      const [total, rows] = await Promise.all([
        table.count({ where }),
        table.findMany({ where, orderBy: { timestamp: "desc" }, skip, take }),
      ]) as [number, unknown[]];

      res.json({
        data: { rows, total, page: Math.max(Number(page) || 1, 1), pageSize: take, totalPages: Math.ceil(total / take) },
        error: null,
      });
    } catch (err) {
      console.error("[system-logs] error", err);
      res.status(500).json({ data: null, error: "Failed to fetch system logs" });
    }
  }
);

export default auditLogsRouter;
