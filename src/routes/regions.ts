import { createRegion, deleteRegion, getRegionById, getRegions } from "@/controllers/region";
import express from "express";
const regionRouter = express.Router();

regionRouter.post("/regions", createRegion);
regionRouter.get("/regions", getRegions);
regionRouter.get("/regions/:id", getRegionById);
regionRouter.delete("/regions/:id", deleteRegion); // <-- Add this line

// schoolRouter.get("/api/v2/customers", getV2Customers);

export default regionRouter;

