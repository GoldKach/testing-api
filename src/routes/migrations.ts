// src/routes/migrations.ts
import { backfillPortfoliosToNewStructure, reactivateAllUsers } from "@/controllers/migrations";
import { Router } from "express";

const migrationsRouter = Router();

// Admin only — protect this with your isAdmin middleware
migrationsRouter.post("/migrations/backfill-portfolios", backfillPortfoliosToNewStructure);
migrationsRouter.post("/migrations/reactivate-all-users", reactivateAllUsers);

export default migrationsRouter;