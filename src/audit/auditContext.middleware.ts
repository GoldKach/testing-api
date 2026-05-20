import { Response, NextFunction } from "express";
import { AuthRequest } from "@/utils/auth";

export interface AuditContext {
  ipAddress: string;
  userAgent: string;
}

export function auditContextMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded
    ? (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0].trim())
    : req.socket.remoteAddress ?? "unknown";

  req.auditContext = {
    ipAddress: ip,
    userAgent: req.headers["user-agent"] ?? "unknown",
  };

  next();
}
