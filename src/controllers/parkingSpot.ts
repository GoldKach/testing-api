import { db } from "@/db/db";
import { Request, Response } from "express";

// Create a parking spot
export async function createParkingSpot(req: Request, res: Response) {
  const { slotCode, slotNumber, parkingLotId, streetId, pricePerHour, spotStatus } = req.body;

  try {
    const existingSpot = await db.parkingSpot.findUnique({
      where: { slotCode },
    });

    if (existingSpot) {
      return res.status(409).json({ error: "Slot code already exists" });
    }

    const newSpot = await db.parkingSpot.create({
      data: {
        slotCode,
        slotNumber,
        parkingLotId,
        streetId,
        spotStatus,
      },
    });

    return res.status(201).json({ data: newSpot });
  } catch (error) {
    console.error("Error creating parking spot:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
}

// Get all parking spots
export async function getParkingSpots(req: Request, res: Response) {
  try {
    const spots = await db.parkingSpot.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        parkingLot: true,
        street: true,
      },
    });
    return res.status(200).json(spots);
  } catch (error) {
    console.error("Error fetching parking spots:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
}

// Get parking spot by ID
export async function getParkingSpotById(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const spot = await db.parkingSpot.findUnique({
      where: { id },
      include: {
        parkingLot: true,
        street: true,
      },
    });

    if (!spot) {
      return res.status(404).json({ error: "Parking spot not found" });
    }

    return res.status(200).json(spot);
  } catch (error) {
    console.error("Error fetching parking spot by ID:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
}

// Delete parking spot by ID
export async function deleteParkingSpot(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const deletedSpot = await db.parkingSpot.delete({
      where: { id },
    });

    return res.status(200).json({
      message: "Parking spot deleted successfully",
      data: deletedSpot,
    });
  } catch (error) {
    console.error("Error deleting parking spot:", error);
    return res.status(500).json({ error: "Failed to delete parking spot" });
  }
}

// update status
// Update parking spot status
export async function updateParkingSpotStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { spotStatus } = req.body;

  if (!spotStatus) {
    return res.status(400).json({ error: "spotStatus is required" });
  }

  try {
    const updatedSpot = await db.parkingSpot.update({
      where: { id },
      data: { spotStatus },
    });

    return res.status(200).json({
      message: "Spot status updated successfully",
      data: updatedSpot,
    });
  } catch (error) {
    console.error("Error updating parking spot status:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
