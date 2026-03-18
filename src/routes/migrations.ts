// src/routes/migrations.ts
import { backfillPortfoliosToNewStructure } from "@/controllers/migrations";
import { Router } from "express";

const migrationsRouter = Router();

// Admin only — protect this with your isAdmin middleware
migrationsRouter.post("/migrations/backfill-portfolios", backfillPortfoliosToNewStructure);

export default migrationsRouter;