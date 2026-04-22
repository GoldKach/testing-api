

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
import userSettingsRouter from "./routes/user-settings";
import staffRouter from "./routes/staff";

// ── New routes ─────────────────────────────────────────────────────
import topupEventsRouter      from "./routes/topup-events";
import portfolioWalletsRouter from "./routes/portfolio-wallets";
import masterWalletsRouter    from "./routes/master-wallets";
import portfolioSummaryRouter from "./routes/portfolio-summary";
import migrationsRouter       from "./routes/migrations";
import sendEmailRouter        from "./routes/send-email";

import { startPortfolioReportCronFromEnv } from "./jobs/portfolio-report-cron";
import { startInactiveUserDeactivationCronFromEnv } from "./jobs/inactive-user-deactivation-cron";

import subPortfoliosRouter from "./routes/subportfolios";

const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT) || 8000;

app.listen(PORT, "0.0.0.0", () => {
  startPortfolioReportCronFromEnv();
  startInactiveUserDeactivationCronFromEnv();
  console.log(`Server is running on http://localhost:${PORT}`);
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// ── Existing routes ────────────────────────────────────────────────
app.use("/api/v1", userRouter);
app.use("/api/v1", authRouter);
app.use("/api/v1", onboardingRouter);
app.use("/api/v1", assetsRouter);
app.use("/api/v1", portfolioRouter);
app.use("/api/v1", portfolioAssetRouter);
app.use("/api/v1", userPortfolioRouter);
app.use("/api/v1", depositsRouter);
app.use("/api/v1", withdrawalsRouter);
app.use("/api/v1", portfolioPerformanceReportsRouter);
app.use("/api/v1", userSettingsRouter);
app.use("/api/v1/staff", staffRouter);

app.use("/api/v1", subPortfoliosRouter);
app.use("/api/v1", topupEventsRouter);
app.use("/api/v1", portfolioWalletsRouter);
app.use("/api/v1", masterWalletsRouter);
app.use("/api/v1", portfolioSummaryRouter);
app.use("/api/v1", migrationsRouter);
app.use("/api/v1", sendEmailRouter); 