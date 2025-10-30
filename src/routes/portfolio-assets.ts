import { Router } from "express";
import {
  createPortfolioAsset,
  listPortfolioAssets,
  getPortfolioAssetById,
  updatePortfolioAsset,
  deletePortfolioAsset,
  listPortfolioAssetsForPortfolio,
} from "@/controllers/portfolioassets";

const portfolioAssetRouter = Router();

portfolioAssetRouter.post("/portfolioassets", createPortfolioAsset);
portfolioAssetRouter.get("/portfolioassets", listPortfolioAssets);
portfolioAssetRouter.get("/portfolioassets/:id", getPortfolioAssetById);
portfolioAssetRouter.patch("/portfolioassets/:id", updatePortfolioAsset);
portfolioAssetRouter.delete("/portfolioassets/:id", deletePortfolioAsset);

// nested list by portfolio
portfolioAssetRouter.get("/portfolios/:portfolioId/portfolioassets", listPortfolioAssetsForPortfolio);

export default portfolioAssetRouter;
