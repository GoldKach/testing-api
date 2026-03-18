// src/routes/portfolio-wallets.ts
import { Router } from "express";
import {
  listPortfolioWallets,
  getPortfolioWalletById,
  getPortfolioWalletByPortfolio,
  updatePortfolioWallet,
} from "@/controllers/portfolio-wallets";

const portfolioWalletsRouter = Router();

// GET /portfolio-wallets?userId=...&status=...
portfolioWalletsRouter.get("/portfolio-wallets",                              listPortfolioWallets);
portfolioWalletsRouter.get("/portfolio-wallets/portfolio/:userPortfolioId",   getPortfolioWalletByPortfolio);
portfolioWalletsRouter.get("/portfolio-wallets/:id",                          getPortfolioWalletById);
portfolioWalletsRouter.patch("/portfolio-wallets/:id",                        updatePortfolioWallet);

export default portfolioWalletsRouter;