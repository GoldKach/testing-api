import { db } from "@/db/db";
import { Request, Response } from "express";

// Create Area
export async function createArea(req: Request, res: Response) {
  const { name, cityId } = req.body;
  try {
    const newArea = await db.area.create({
      data: { name, cityId },
    });

    console.log(`Area created successfully: ${newArea.name} (${newArea.id})`);
    return res.status(201).json({
      data: newArea,
      error: null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      data: null,
      error: "Something went wrong",
    });
  }
}

// Get All Areas
export async function getAreas(req: Request, res: Response) {
  try {
    const areas = await db.area.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        parkingLots: true,
        streets: true,
        city: true,
      },
    });

    return res.status(200).json(areas);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to retrieve areas" });
  }
}

// Get Area by ID
export async function getAreaById(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const area = await db.area.findUnique({
      where: { id },
      include: {
        parkingLots: true,
        streets: true,
        city: true,
      },
    });

    if (!area) {
      return res.status(404).json({ error: "Area not found" });
    }

    return res.status(200).json(area);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to retrieve area" });
  }
}

// delete
export async function deleteArea(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const deletedArea = await db.area.delete({
      where: { id },
    });

    return res.status(200).json({
      data: deletedArea,
      message: "Area deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting area:", error);
    return res.status(500).json({
      error: "Failed to delete area",
    });
  }
}