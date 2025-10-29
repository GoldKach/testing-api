import { Request, Response } from "express";
import { db } from "@/db/db";

export async function releaseSpots(req: Request, res: Response) {
  try {
    const now = new Date();

    // Step 1: Find bookings that should release the spot
    const bookingsToRelease = await db.booking.findMany({
      where: {
        OR: [
          { bookingStatus: "CANCELLED" },
          { bookingStatus: "EXPIRED" },
          {
            bookingStatus: "OCCUPIED",
            startTime: {
              lt: new Date(now.getTime() - 1000 * 60 * 60), // started over 1 hour ago
            },
          },
        ],
      },
      select: {
        id: true,
        parkingSpotId: true,
        bookingStatus: true,
        startTime: true,
        hours: true,
      },
    });

    const spotIdsToRelease = new Set<string>();

    for (const booking of bookingsToRelease) {
      const endTime = new Date(booking.startTime.getTime() + booking.hours * 60 * 60 * 1000);

      if (
        booking.bookingStatus === "CANCELLED" ||
        booking.bookingStatus === "EXPIRED" ||
        (booking.bookingStatus === "OCCUPIED" && now >= endTime)
      ) {
        spotIdsToRelease.add(booking.parkingSpotId);
      }
    }

    // Step 2: Update spots
    let updatedCount = 0;
    for (const spotId of spotIdsToRelease) {
      await db.parkingSpot.update({
        where: { id: spotId },
        data: { spotStatus: "AVAILABLE" },
      });
      updatedCount++;
    }

    return res.status(200).json({
      message: `Released ${updatedCount} parking spots`,
      spotIds: Array.from(spotIdsToRelease),
    });
  } catch (error) {
    console.error("Error releasing spots:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
