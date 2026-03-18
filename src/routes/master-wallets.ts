// src/routes/master-wallets.ts
import { Router } from "express";
import {
  listMasterWallets,
  getMasterWalletById,
  getMasterWalletByUser,
  updateMasterWallet,
  syncMasterWalletForUser,
} from "@/controllers/master-wallets";

const masterWalletsRouter = Router();

masterWalletsRouter.get("/master-wallets",                  listMasterWallets);
masterWalletsRouter.get("/master-wallets/user/:userId",     getMasterWalletByUser);
masterWalletsRouter.get("/master-wallets/:id",              getMasterWalletById);
masterWalletsRouter.patch("/master-wallets/:id",            updateMasterWallet);
masterWalletsRouter.post("/master-wallets/sync/:userId",    syncMasterWalletForUser);

export default masterWalletsRouter;