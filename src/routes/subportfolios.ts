// src/routes/sub-portfolios.ts
import { Router } from "express";
import {
  listSubPortfolios,
  getSubPortfolioById,
  updateSubPortfolio,
} from "@/controllers/sub-portfolios";

const subPortfoliosRouter = Router();

// GET /sub-portfolios?userPortfolioId=...&generation=...
subPortfoliosRouter.get("/sub-portfolios",      listSubPortfolios);
subPortfoliosRouter.get("/sub-portfolios/:id",  getSubPortfolioById);
subPortfoliosRouter.patch("/sub-portfolios/:id", updateSubPortfolio);

export default subPortfoliosRouter;