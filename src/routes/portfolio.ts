// src/routes/portfolio.ts
import { Router } from "express";
import {
  createPortfolio,
  listPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
} from "@/controllers/portfolio";

const portfolioRouter = Router();
portfolioRouter.get("/portfolios", listPortfolios);
portfolioRouter.get("/portfolios/:id", getPortfolioById);
portfolioRouter.post("/portfolios", createPortfolio);
portfolioRouter.patch("/portfolios/:id", updatePortfolio);
portfolioRouter.delete("/portfolios/:id", deletePortfolio);

export default portfolioRouter;
