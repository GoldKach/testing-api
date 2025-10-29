import {
  createBooking,
  getBookings,
  getBookingById,
  updateBookingStatus,
} from "@/controllers/booking";
import { Router } from "express";

const bookingRouter = Router();

bookingRouter.post("/bookings", createBooking);
bookingRouter.get("/bookings", getBookings);
bookingRouter.get("/bookings/:id", getBookingById);
bookingRouter.patch("/:id/status", updateBookingStatus)

export default bookingRouter;
