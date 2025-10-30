// src/routes/assets.ts
import { Router } from "express";
import {
  listAssets,
  getAssetById,
  getAssetBySymbol,
  createAsset,
  updateAsset,
  deleteAsset,
} from "@/controllers/assets";

const assetsRouter= Router();

assetsRouter.get("/assets", listAssets);
assetsRouter.get("/assets/:id", getAssetById);
assetsRouter.get("/assets/symbol/:symbol", getAssetBySymbol);
assetsRouter.post("/assets", createAsset);
assetsRouter.patch("/assets/:id", updateAsset);
assetsRouter.delete("/assets/:id", deleteAsset);

export default assetsRouter;
