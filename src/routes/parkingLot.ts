
import { createParkingLot, deleteParkingLot, getParkingLotById, getParkingLots } from "@/controllers/parkingLots";
import { Router } from "express";

const parkingLotRouter = Router();

parkingLotRouter.post("/parking-lots", createParkingLot);
parkingLotRouter.get("/parking-lots", getParkingLots);
parkingLotRouter.get("/parking-lots/:id", getParkingLotById);
parkingLotRouter.delete("/parking-lots/:id", deleteParkingLot); 

export default parkingLotRouter;
