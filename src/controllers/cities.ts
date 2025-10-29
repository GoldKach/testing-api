import { db } from "@/db/db";
import { Request, Response } from "express";

// create all data
export async function createCity(req: Request, res: Response) {
  const { name,regionId} = req.body;
  try {
    
    const newCity = await db.city.create({
      data: { name,regionId},
    });
    console.log(
      `city registered successfully: ${newCity.name} (${newCity.id})`
    );
    return res.status(201).json({
      data: newCity,
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
export async function getCities(req: Request, res: Response) {
  try {
    const cities = await db.city.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include:{
      parkingLots:true,
      areas:true,
      region:true
    }
    });
    return res.status(200).json(cities);
  } catch (error) {
    console.log(error);
  }
}
// get data by ID 
export async function getCityById(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const city = await db.city.findUnique({
      where: {
        id,
      },
    });
    return res.status(200).json(city);
  } catch (error) {
    console.log(error);
  }
}

// delete
export async function deleteCity(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const deletedCity = await db.city.delete({
      where: { id },
    });
    return res.status(200).json({
      data: deletedCity,
      message: "City deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting city:", error);
    return res.status(500).json({
      error: "Failed to delete city",
    });
  }
}