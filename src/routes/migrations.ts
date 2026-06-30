// src/routes/migrations.ts
import { backfillPortfoliosToNewStructure, reactivateAllUsers, resetCostPerShareToOriginal, resetCostPriceAfterRedemptions, fixReportClosePrices } from "@/controllers/migrations";
import { Router } from "express";

const migrationsRouter = Router();

// Admin only — protect this with your isAdmin middleware
migrationsRouter.post("/migrations/backfill-portfolios", backfillPortfoliosToNewStructure);
migrationsRouter.post("/migrations/reactivate-all-users", reactivateAllUsers);
migrationsRouter.post("/migrations/reset-cost-per-share", resetCostPerShareToOriginal);
migrationsRouter.post("/migrations/reset-cost-price", resetCostPriceAfterRedemptions);
migrationsRouter.post("/migrations/fix-report-close-prices", fixReportClosePrices);

export default migrationsRouter;