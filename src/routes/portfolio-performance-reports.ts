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

const portfolioPerformanceReportsRouter = Router();

// List reports with filters
portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports",
  listPerformanceReports
);

// Get specific report by ID
portfolioPerformanceReportsRouter.get(
  "/portfolio-performance-reports/:id",
  getPerformanceReportById
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

// Generate reports for all portfolios (cron job endpoint)
portfolioPerformanceReportsRouter.post(
  "/portfolio-performance-reports/generate-all",
  generateAllPerformanceReports
);

// Cleanup old reports
portfolioPerformanceReportsRouter.delete(
  "/portfolio-performance-reports/cleanup",
  cleanupPerformanceReports
);

export default portfolioPerformanceReportsRouter;