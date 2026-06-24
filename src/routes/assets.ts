// src/routes/assets.ts
import { Router } from "express";
import {
  listAssets,
  getAssetById,
  getAssetBySymbol,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetPriceHistory,
  batchUpsertAssetPriceHistory,
} from "@/controllers/assets";

const assetsRouter= Router();

// ── Price-history routes (static, before /:id) ─────────────────────
assetsRouter.get("/assets/price-history",       getAssetPriceHistory);
assetsRouter.post("/assets/price-history/batch", batchUpsertAssetPriceHistory);

// ── Standard asset CRUD ─────────────────────────────────────────────
assetsRouter.get("/assets",                listAssets);
assetsRouter.get("/assets/symbol/:symbol", getAssetBySymbol);
assetsRouter.post("/assets",               createAsset);
assetsRouter.patch("/assets/:id",          updateAsset);
assetsRouter.delete("/assets/:id",         deleteAsset);
assetsRouter.get("/assets/:id",            getAssetById);

export default assetsRouter;
