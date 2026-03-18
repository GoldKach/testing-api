// src/routes/staff.routes.ts
import {
  assignClientToAgent,
  createStaffMember,
  deactivateStaffMember,
  getAgentClients,
  getAgentForClient,
  getAllStaff,
  getStaffById,
  hardDeleteStaffMember,
  unassignClientFromAgent,
  updateStaffMember,
} from "@/controllers/staff";
import express from "express";
import rateLimit from "express-rate-limit";

const staffRouter = express.Router();

// ─── Rate limiter for write operations ──────────────────────────────────────
const staffWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    status: 429,
    error: "Too many requests. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Staff CRUD ──────────────────────────────────────────────────────────────
staffRouter.post("/", staffWriteLimiter, createStaffMember);
staffRouter.get("/", getAllStaff);

// ⚠️ IMPORTANT: static routes before dynamic /:id
staffRouter.get("/agent-for-client/:clientId", getAgentForClient);

staffRouter.get("/:id", getStaffById);
staffRouter.put("/:id", staffWriteLimiter, updateStaffMember);
staffRouter.delete("/:id", staffWriteLimiter, deactivateStaffMember);

// ─── Agent ↔ Client assignment ───────────────────────────────────────────────
staffRouter.get("/:id/clients", getAgentClients);
staffRouter.post("/:id/clients", staffWriteLimiter, assignClientToAgent);
staffRouter.delete("/:id/clients/:clientId", staffWriteLimiter, unassignClientFromAgent);
staffRouter.delete("/:id/delete", hardDeleteStaffMember);


export default staffRouter;