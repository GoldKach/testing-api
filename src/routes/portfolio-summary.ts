// src/routes/portfolio-summary.ts
import { Router } from "express";
import {
  getPortfolioSummary,
  refreshPortfolioSummary,
} from "@/controllers/portfolio-summary";

const portfolioSummaryRouter = Router();

portfolioSummaryRouter.get("/portfolio-summary/:userId",           getPortfolioSummary);
portfolioSummaryRouter.post("/portfolio-summary/:userId/refresh",  refreshPortfolioSummary);

export default portfolioSummaryRouter;