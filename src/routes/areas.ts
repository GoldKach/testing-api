import { createArea, deleteArea, getAreaById, getAreas } from "@/controllers/areas";
import { createStreet, getStreetById, getStreets } from "@/controllers/street";
import { Router } from "express";


const areaRouter = Router();

areaRouter.post("/areas", createArea);
areaRouter.get("/areas", getAreas);
areaRouter.get("/areas/:id", getAreaById);
areaRouter.delete("/areas/:id", deleteArea); // <-- Add this line

export default areaRouter;
