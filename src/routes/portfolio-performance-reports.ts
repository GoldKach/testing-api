// src/routes/portfolio-performance-reports.ts
import { Router } from "express";
import {
  listPerformanceReports,
  getPerformanceReportById,
  generatePerformanceReport,
  generateAllPerformanceReports,
  generateAllPortfoliosForDate,
  getLatestPerformanceReport,
  getPerformanceStatistics,
  cleanupPerformanceReports,
  backfillAssetSnapshots,
} from "@/controllers/portfolio-performance-reports";
import {
  generateUserPerformanceReports,
  regeneratePerformanceReport,
  generateTodayReport,
} from "@/controllers/portfolio-performance-report";

const portfolioPerformanceReportsRouter = Router();

// ── Static routes first (before /:id) ─────────────────────────────

// List reports with filters
portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports",
  listPerformanceReports
);

// Get latest report for a portfolio
portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports/latest/:userPortfolioId",
  getLatestPerformanceReport
);

// Get performance statistics
portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports/stats/:userPortfolioId",
  getPerformanceStatistics
);

// Generate report manually for a specific portfolio
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate",
  generatePerformanceReport
);

// Generate for all portfolios of a single user
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate-for-user",
  generateUserPerformanceReports
);

// Force-regenerate: delete existing report for portfolio + date, recreate from AssetPriceHistory
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/regenerate",
  regeneratePerformanceReport
);

// Generate today's report: snapshots live prices first, then generates
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate-today",
  generateTodayReport
);

// Generate reports for all portfolios (cron job endpoint)
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate-all",
  generateAllPerformanceReports
);

// Regenerate reports for ALL portfolios for a specific date (replaces existing)
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate-all-for-date",
  generateAllPortfoliosForDate
);

// Cleanup old reports
portfolioPerformanceReportsRouter.delete(
  "/portfolio-performance-reports/cleanup",
  cleanupPerformanceReports
);

// Backfill assetSnapshots for existing reports that lack them
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/backfill-snapshots",
  backfillAssetSnapshots
);

// ── Dynamic :id route last ─────────────────────────────────────────

// Get specific report by ID
portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports/:id",
  getPerformanceReportById
);

export default portfolioPerformanceReportsRouter;