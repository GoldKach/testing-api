import {
  createParkingSpot,
  getParkingSpots,
  getParkingSpotById,
  deleteParkingSpot,
  updateParkingSpotStatus,
} from "@/controllers/parkingSpot";
import { Router } from "express";

const parkingSpotRouter = Router();

parkingSpotRouter.post("/parking-spots", createParkingSpot);
parkingSpotRouter.get("/parking-spots", getParkingSpots);
parkingSpotRouter.get("/parking-spots/:id", getParkingSpotById);
parkingSpotRouter.delete("/parking-spots/:id", deleteParkingSpot);
parkingSpotRouter.patch("/parking-spots/:id/status", updateParkingSpotStatus);


export default parkingSpotRouter;
