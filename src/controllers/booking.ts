import { db } from "@/db/db";
import { Request, Response } from "express";

// Create a booking
// export async function createBooking(req: Request, res: Response) {
//   const {
//     userId,
//     parkingSpotId,
//     parkingLotId,
//     startTime,
//     hours,
//     paymentMethod,
//     totalAmount,
//     paymentStatus,
//     bookingStatus,
//   } = req.body;

//   try {
//     const newBooking = await db.booking.create({
//       data: {
//         userId,
//         parkingSpotId,
//         parkingLotId,
//         startTime: new Date(startTime),
//         paymentMethod,
//         hours,
//         totalAmount,
//         paymentStatus,
//         bookingStatus,
//       },
//     });

//     return res.status(201).json({ data: newBooking });
//   } catch (error) {
//     console.error("Error creating booking:", error);
//     return res.status(500).json({ error: "Something went wrong" });
//   }
// }

export async function createBooking(req:Request, res:Response) {
  const {
    userId,
    parkingSpotId,
    parkingLotId,
    startTime,
    hours,
    paymentMethod,
    totalAmount,
    paymentStatus = "PENDING", // default value
    bookingStatus = "PENDING", // default value
  } = req.body;

  console.log("Create Booking Payload:", req.body);

  // Basic validation
 const missingFields = [];

if (!userId) missingFields.push("userId");
if (!parkingSpotId) missingFields.push("parkingSpotId");
if (!parkingLotId) missingFields.push("parkingLotId");
if (!startTime) missingFields.push("startTime");
if (!hours) missingFields.push("hours");
if (!totalAmount) missingFields.push("totalAmount");

if (missingFields.length > 0) {
  return res.status(400).json({
    error: "Missing required booking fields",
    missing: missingFields,
  });
}


  try {
    // Check if spot already booked (assuming your db layer supports a findOne/findFirst)
    // const existingBooking = await db.booking.findUnique({
    //   where: {
    //     parkingSpotId,
    //     startTime: new Date(startTime),
    //     bookingStatus:"PENDING" // or equivalent filtering
    //   },
    // });

    // if (existingBooking) {
    //   return res.status(400).json({ error: "This parking spot is already booked at the selected time" });
    // }

    // Create booking
    const newBooking = await db.booking.create({
      data: {
        userId,
        parkingSpotId,
        parkingLotId,
        startTime: new Date(startTime),
        hours,
        paymentMethod,
        totalAmount,
        paymentStatus,
        bookingStatus:"CONFIRMED",
      },
    });

    await db.parkingSpot.update({
      where: { id: parkingSpotId },
      data: { spotStatus: "BOOKED" },
    });
    return res.status(201).json({ data: newBooking });
  } catch (error) {
    console.error("Error creating booking:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function getBookings(req: Request, res: Response) {
  try {
    const bookings = await db.booking.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: true,
        parkingSpot: true,
        parkingLot: {
          include:{
            street:true
          }
        }
      },
    });

    return res.status(200).json(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
}

// Get booking by ID
// export async function getBookingById(req: Request, res: Response) {
//   const { id } = req.params;

//   try {
//     const booking = await db.booking.findUnique({
//       where: { id },
//       include: {
//         user: true,
//         parkingSpot: true,
//         parkingLot: true,
//       },
//     });

//     if (!booking) {
//       return res.status(404).json({ error: "Booking not found" });
//     }

//     return res.status(200).json(booking);
//   } catch (error) {
//     console.error("Error fetching booking:", error);
//     return res.status(500).json({ error: "Something went wrong" });
//   }
// }


export async function getBookingById(req: Request, res: Response) {
  const { id } = req.params;

  try {
    let booking = await db.booking.findUnique({
      where: { id },
      include: {
        user: true,
        parkingSpot: true,
        parkingLot: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Calculate end time
    const startTime = new Date(booking.startTime);
    const endTime = new Date(startTime.getTime() + booking.hours * 60 * 60 * 1000);
    const now = new Date();

    // Auto-update booking status to EXPIRED if past end time
    if (booking.bookingStatus === "CONFIRMED" && now >= endTime) {
      booking = await db.booking.update({
        where: { id },
        data: { bookingStatus: "EXPIRED" },
        include: {
          user: true,
          parkingSpot: true,
          parkingLot: true,
        },
      });
    }

    return res.status(200).json(booking);
  } catch (error) {
    console.error("Error fetching booking:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
}

// export async function updateBookingStatus(req: Request, res: Response) {
//   const { id } = req.params;
//   const { status } = req.body;

//   const validStatuses = [
//     "PENDING",
//     "CONFIRMED",
//     "EXPIRED",
//     "OCCUPIED",
//     "CANCELLED",
//     "COMPLETED",
//   ];

//   if (!validStatuses.includes(status)) {
//     return res.status(400).json({ error: "Invalid status value" });
//   }

//   try {
//     const booking = await db.booking.update({
//       where: { id },
//       data: {
//         bookingStatus: status,
//       },
//     });

//     return res.status(200).json({ message: "Booking status updated", booking });
//   } catch (error) {
//     console.error("Error updating booking status:", error);
//     return res.status(500).json({ error: "Something went wrong" });
//   }
// }

export async function updateBookingStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = [
    "PENDING",
    "CONFIRMED",
    "EXPIRED",
    "OCCUPIED",
    "CANCELLED",
    "COMPLETED",
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    // Fetch booking to get associated parkingSpotId
    const existingBooking = await db.booking.findUnique({
      where: { id },
      select:{
        id:true,
         bookingStatus: true,
        parkingSpotId: true 

      }
    });

    if (!existingBooking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Update booking status
    const updatedBooking = await db.booking.update({
      where: { id },
      data: {
        bookingStatus: status,
      },
    });

    // If booking is completed or cancelled, set spot as AVAILABLE
    if (status === "CANCELLED" || status === "COMPLETED" || status === "EXPIRED") {
      await db.parkingSpot.update({
        where: { id: existingBooking.parkingSpotId },
        data: { spotStatus: "AVAILABLE" },
      });
    }

    return res.status(200).json({ message: "Booking status updated", booking: updatedBooking });
  } catch (error) {
    console.error("Error updating booking status:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
