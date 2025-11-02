// src/routes/deposits.ts
import { Router } from "express";
import {
  listDeposits,
  getDepositById,
  createDeposit,
  updateDeposit,
  deleteDeposit,
  approveDeposit,
  reverseDeposit,
} from "@/controllers/deposits";

const depositsRouter = Router();

// List + filters + pagination + sorting
depositsRouter.get("/deposits", listDeposits);

// Read single (supports ?include=user,wallet)
depositsRouter.get("/deposits/:id", getDepositById);

// Create
depositsRouter.post("/deposits", createDeposit);

// Update (amount/status safe with wallet adjustments)
depositsRouter.patch("/deposits/:id", updateDeposit);

// Delete (only if not COMPLETED)
depositsRouter.delete("/deposits/:id", deleteDeposit);

// Workflow helpers
depositsRouter.post("/deposits/:id/approve", approveDeposit);
depositsRouter.post("/deposits/:id/reverse", reverseDeposit);

export default depositsRouter;
