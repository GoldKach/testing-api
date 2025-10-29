require("dotenv").config();

import express from "express";
import userRouter from "./routes/users";
import regionRouter from "./routes/regions";
import cityRouter from "./routes/cities";
import streetRouter from "./routes/streets";
import parkingSpotRouter from "./routes/parkingSpot";
import bookingRouter from "./routes/booking";
import areaRouter from "./routes/areas";
import parkingLotRouter from "./routes/parkingLot";
import releaseRouter from "./routes/bookingRoutes";
import { scheduleReleaseSpotsJob } from "./controllers/cron/releaseSpotsJob";
const cors = require("cors");

const app = express();
scheduleReleaseSpotsJob();

app.use(cors());

const PORT = process.env.PORT || 8000;

app.use(express.json());
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`); 
});

app.use("/api/v1", userRouter); 
app.use("/api/v1", regionRouter);
app.use("/api/v1", cityRouter);
app.use("/api/v1", streetRouter);
app.use("/api/v1", parkingLotRouter);
app.use("/api/v1", parkingSpotRouter);
app.use("/api/v1", bookingRouter);
app.use("/api/v1", areaRouter);
app.use("/api/v1", releaseRouter);
