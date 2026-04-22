// src/routes/portfolio-summary.ts
import { Router } from "express";
import { authenticateToken } from "@/utils/auth";
import {
  getPortfolioSummary,
  refreshPortfolioSummary,
} from "@/controllers/portfolio-summary";

const portfolioSummaryRouter = Router();

portfolioSummaryRouter.get("/portfolio-summary/:userId", authenticateToken, getPortfolioSummary);
portfolioSummaryRouter.post("/portfolio-summary/:userId/refresh", authenticateToken, refreshPortfolioSummary);

export default portfolioSummaryRouter;