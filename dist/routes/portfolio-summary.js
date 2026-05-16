"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../utils/auth");
const portfolio_summary_1 = require("../controllers/portfolio-summary");
const portfolioSummaryRouter = (0, express_1.Router)();
portfolioSummaryRouter.get("/portfolio-summary/:userId", auth_1.authenticateToken, portfolio_summary_1.getPortfolioSummary);
portfolioSummaryRouter.post("/portfolio-summary/:userId/refresh", auth_1.authenticateToken, portfolio_summary_1.refreshPortfolioSummary);
exports.default = portfolioSummaryRouter;
