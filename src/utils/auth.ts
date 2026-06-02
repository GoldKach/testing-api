
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuditContext } from "@/audit/auditContext.middleware";

export interface TokenPayload {
  id:string;
  userId: string;
  email: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
  auditContext?: AuditContext;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  // Tokens are signed with JWT_SECRET (see src/lib/tokens.ts generateAccessToken)
  const secret = process.env.JWT_SECRET ?? process.env.ACCESS_TOKEN_SECRET ?? "";
  jwt.verify(token, secret, (err, decoded) => {
    if (err || !decoded) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    req.user = decoded as TokenPayload; // Ensure correct typing
    next();
  });
}
