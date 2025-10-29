import { createCity, deleteCity, getCities, getCityById } from "@/controllers/cities";
import { createRegion, getRegionById, getRegions } from "@/controllers/region";
import express from "express";
const cityRouter = express.Router();

cityRouter.post("/cities", createCity);
cityRouter.get("/cities", getCities);
cityRouter.get("/cities/:id", getCityById);
cityRouter.delete("/cities/:id", deleteCity); // <-- Add this line
// schoolRouter.get("/api/v2/customers", getV2Customers);

export default cityRouter;

