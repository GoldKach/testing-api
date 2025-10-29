
import { createStreet, deleteStreet, getStreetById, getStreets } from "@/controllers/street";
import express from "express";
const streetRouter = express.Router();

streetRouter.post("/streets", createStreet);
streetRouter.get("/streets", getStreets);
streetRouter.get("/streets/:id",getStreetById);
streetRouter.delete("/streets/:id", deleteStreet); // <-- Add this line
// schoolRouter.get("/api/v2/customers", getV2Customers);

export default streetRouter;

