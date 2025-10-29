import { db } from "@/db/db";
import { Request, Response } from "express";

// create all data
export async function createRegion(req: Request, res: Response) {
  const { name} = req.body;
  try {
    // check if distributor already exists
    const existingRegion = await db.region.findUnique({
      where: {
        name,
      },
    });
    if(existingRegion){
            return res.status(409).json({
                data: null,
                error: "region already exists",
              });
          }
    
    const newRegion = await db.region.create({
      data: { name},
    });
    console.log(
      `region registered successfully: ${newRegion.name} (${newRegion.id})`
    );
    return res.status(201).json({
      data: newRegion,
      error: null,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      data: null,
      error: "Something went wrong",
      setLoading:false
    });
  }
}
// get all data
export async function getRegions(req: Request, res: Response) {
  try {
    const regions = await db.region.findMany({
      orderBy: {
        createdAt: "desc",
      },
        include: {
    cities: {
      include: {
        areas: {
          include: {
            streets: true,
          },
        },
      },
    },
  },
    });
    return res.status(200).json(regions);
  } catch (error) {
    console.log(error);
  }
}
// get data by ID 
export async function getRegionById(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const region = await db.region.findUnique({
      where: {
        id,
      },
    });
    return res.status(200).json(region);
  } catch (error) {
    console.log(error);
  }
}

// delete region by ID
export async function deleteRegion(req: Request, res: Response) {
  const { id } = req.params;

  try {
    // Check if the region exists
    const existingRegion = await db.region.findUnique({
      where: { id },
    });

    if (!existingRegion) {
      return res.status(404).json({
        data: null,
        error: "Region not found",
      });
    }

    // Optionally check if the region has linked cities/areas/streets and prevent deletion
    // For example:
    const hasCities = await db.city.findFirst({
      where: { regionId: id },
    });

    if (hasCities) {
      return res.status(400).json({
        data: null,
        error: "Cannot delete region with associated cities",
      });
    }

    // Delete the region
    const deletedRegion = await db.region.delete({
      where: { id },
    });

    console.log(`Region deleted successfully: ${deletedRegion.name} (${deletedRegion.id})`);

    return res.status(200).json({
      data: deletedRegion,
      error: null,
    });
  } catch (error) {
    console.error("Error deleting region:", error);
    return res.status(500).json({
      data: null,
      error: "Something went wrong while deleting the region",
    });
  }
}
