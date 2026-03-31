// src/routes/portfolio-performance-reports.ts
import { Router } from "express";
import {
  listPerformanceReports,
  getPerformanceReportById,
  generatePerformanceReport,
  generateAllPerformanceReports,
  getLatestPerformanceReport,
  getPerformanceStatistics,
  cleanupPerformanceReports,
} from "@/controllers/portfolio-performance-reports";
import { generateUserPerformanceReports } from "@/controllers/portfolio-performance-report";
import { generatePortfolioPdfReport } from "@/controllers/portfolio-pdf-report";

const portfolioPerformanceReportsRouter = Router();

// ── Static / action routes first (before /:id) ────────────────────

portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports",
  listPerformanceReports
);

portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports/latest/:userPortfolioId",
  getLatestPerformanceReport
);

portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports/stats/:userPortfolioId",
  getPerformanceStatistics
);

// Generate for a single portfolio
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate",
  generatePerformanceReport
);

// Generate for all portfolios of a single user
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate-for-user",
  generateUserPerformanceReports
);

// Generate for all portfolios system-wide (cron)
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate-all",
  generateAllPerformanceReports
);

portfolioPerformanceReportsRouter.delete(
  "/portfolio-performance-reports/cleanup",
  cleanupPerformanceReports
);

// ── PDF report for a single portfolio ─────────────────────────────
portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports/pdf/:userPortfolioId",
  generatePortfolioPdfReport
);

// ── Dynamic :id route last ─────────────────────────────────────────

portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports/:id",
  getPerformanceReportById
);

export default portfolioPerformanceReportsRouter;