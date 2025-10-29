import cron from "node-cron";
import { db } from "@/db/db";

export const scheduleReleaseSpotsJob = () => {
  cron.schedule("*/5 * * * *", async () => {
    // Runs every 10 minutes
    console.log("⏰ Running scheduled task: releaseSpots");

    const now = new Date();
    try {
      const bookingsToRelease = await db.booking.findMany({
        where: {
          OR: [
            { bookingStatus: "CANCELLED" },
            { bookingStatus: "EXPIRED" },
            {
              bookingStatus: "OCCUPIED",
              startTime: {
                lt: new Date(now.getTime() - 1000 * 60 * 60),
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

      for (const spotId of spotIdsToRelease) {
        await db.parkingSpot.update({
          where: { id: spotId },
          data: { spotStatus: "AVAILABLE" },
        });
      }

      console.log(`✅ Released ${spotIdsToRelease.size} parking spots.`);
    } catch (error) {
      console.error("❌ Error during scheduled releaseSpots:", error);
    }
  });
};
