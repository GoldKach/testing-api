require("dotenv").config();

import express from "express";
import userRouter from "./routes/users";
import authRouter from "./routes/auth";
import assetsRouter from "./routes/assets";
import onboardingRouter from "./routes/onboarding";
import portfolioRouter from "./routes/portfolio";
import portfolioAssetRouter from "./routes/portfolio-assets";
import userPortfolioRouter from "./routes/userportfolio";
import depositsRouter from "./routes/deposits";
import withdrawalsRouter from "./routes/withdraws";
import portfolioPerformanceReportsRouter from "./routes/portfolio-performance-reports";
import { startPortfolioReportCronFromEnv } from "./jobs/portfolio-report-generator-2min";
const cors = require("cors");

const app = express();

app.use(cors());

const PORT = process.env.PORT || 8000;

app.use(express.json());
app.listen(PORT, () => {
    startPortfolioReportCronFromEnv();

  console.log(`Server is running on http://localhost:${PORT}`); 
});

app.use("/api/v1", userRouter); 
app.use("/api/v1",authRouter);
app.use("/api/v1",onboardingRouter);
app.use("/api/v1", assetsRouter);
app.use("/api/v1", portfolioRouter);
app.use("/api/v1", portfolioAssetRouter);
app.use("/api/v1", userPortfolioRouter);
app.use("/api/v1", depositsRouter);
app.use("/api/v1", withdrawalsRouter);
app.use("/api/v1", portfolioPerformanceReportsRouter);
