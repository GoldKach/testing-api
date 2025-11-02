// src/routes/withdrawals.ts
import { Router } from "express";
import {
  listWithdrawals,
  getWithdrawalById,
  createWithdrawal,
  updateWithdrawal,
  deleteWithdrawal,
  approveWithdrawal,
  rejectWithdrawal,
} from "@/controllers/withdraws";

const withdrawalsRouter = Router();

withdrawalsRouter.get("/withdrawals", listWithdrawals);
withdrawalsRouter.get("/withdrawals/:id", getWithdrawalById);
withdrawalsRouter.post("/withdrawals", createWithdrawal);
withdrawalsRouter.patch("/withdrawals/:id", updateWithdrawal);
withdrawalsRouter.delete("/withdrawals/:id", deleteWithdrawal);

// status transitions
withdrawalsRouter.post("/withdrawals/:id/approve", approveWithdrawal);
withdrawalsRouter.post("/withdrawals/:id/reject", rejectWithdrawal);

export default withdrawalsRouter;
