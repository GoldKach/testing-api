import { db } from "@/db/db";
import { Request, Response } from "express";

// create all data
export async function createStreet(req: Request, res: Response) {
  const { name,areaId} = req.body;
  try {
    
    const newStreet = await db.street.create({
      data: { name,areaId},
    });
    console.log(
      `street registered successfully: ${newStreet.name} (${newStreet.id})`
    );
    return res.status(201).json({
      data: newStreet,
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
export async function getStreets(req: Request, res: Response) {
  try {
    const streets = await db.street.findMany({
      orderBy: {
        createdAt: "desc",
      },include:{
        area:true,
        spots:true
      }
    });
    return res.status(200).json(streets);
  } catch (error) {
    console.log(error);
  }
}
// get data by ID 
export async function getStreetById(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const street = await db.street.findUnique({
      where: {
        id,
      },
    });
    return res.status(200).json(street);
  } catch (error) {
    console.log(error);
  }
}
// gegeg
export async function deleteStreet(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const deletedStreet = await db.street.delete({
      where: { id },
    });

    return res.status(200).json({
      data: deletedStreet,
      message: "Street deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting street:", error);
    return res.status(500).json({
      error: "Failed to delete street",
    });
  }
}