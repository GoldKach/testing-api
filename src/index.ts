require("dotenv").config();

import express from "express";
import userRouter from "./routes/users";
import authRouter from "./routes/auth";
import assetsRouter from "./routes/assets";
import onboardingRouter from "./routes/onboarding";
const cors = require("cors");

const app = express();

app.use(cors());

const PORT = process.env.PORT || 8000;

app.use(express.json());
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`); 
});

app.use("/api/v1", userRouter); 
app.use("api/v1",authRouter);
app.use("api/v1",onboardingRouter);
app.use("/api/v1", assetsRouter);
