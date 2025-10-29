import { db } from "@/db/db";
import { Request, Response } from "express";

// Create a ParkingLot
export async function createParkingLot(req: Request, res: Response) {
  const {
    name,
    address,
    plotNo,
    latitude,
    longitude,
    openingHour,
    closingHour,
    securityLevel,
    pricePerHour,
    capacity,
    status,
    streetId,
    areaId,
    cityId,
    regionId
  } = req.body;

  try {
    const existingLot = await db.parkingLot.findUnique({
      where: { name }
    });

    if (existingLot) {
      return res.status(409).json({
        data: null,
        error: "Parking lot already exists",
      });
    }

    const newLot = await db.parkingLot.create({
      data: {
        name,
        address,
        plotNo,
        latitude,
        longitude,
        openingHour,
        closingHour,
        securityLevel,
        capacity,
        status,
        streetId,
        areaId,
        cityId,
        regionId,
      },
    });

    console.log(`Parking lot created: ${newLot.name} (${newLot.id})`);

    return res.status(201).json({
      data: newLot,
      error: null,
    });
  } catch (error) {
    console.error("Create ParkingLot Error:", error);
    return res.status(500).json({
      data: null,
      error: "Something went wrong",
    });
  }
}

// Get all ParkingLots
export async function getParkingLots(req: Request, res: Response) {
  try {
    const lots = await db.parkingLot.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        area: true,
        city: true,
        region: true,
        spots: true,
        bookings: true,
      },
    });

    return res.status(200).json(lots);
  } catch (error) {
    console.error("Get ParkingLots Error:", error);
    return res.status(500).json({
      error: "Failed to fetch parking lots",
    });
  }
}

// Get ParkingLot by ID
export async function getParkingLotById(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const lot = await db.parkingLot.findUnique({
      where: { id },
      include: {
        area: true,
        city: true,
        region: true,
        spots: true,
        bookings: true,
      },
    });

    if (!lot) {
      return res.status(404).json({ error: "Parking lot not found" });
    }

    return res.status(200).json(lot);
  } catch (error) {
    console.error("Get ParkingLotById Error:", error);
    return res.status(500).json({ error: "Failed to fetch parking lot" });
  }
}
// delete
export async function deleteParkingLot(req: Request, res: Response) {
  const { id } = req.params;

  try {
    const deletedLot = await db.parkingLot.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Parking lot deleted successfully",
      data: deletedLot,
    });
  } catch (error) {
    console.error("Delete ParkingLot Error:", error);
    return res.status(500).json({ error: "Failed to delete parking lot" });
  }
}