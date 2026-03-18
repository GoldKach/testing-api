
// src/jobs/portfolio-report-cron.ts
import cron from "node-cron";
import { generateDailyReportsForAllPortfolios } from "@/controllers/portfolio-performance-reports";

/**
 * Internal executor – used by all schedules
 */
async function executePortfolioReportJob(label: string) {
  const now = new Date().toISOString();

  console.log("============================================================");
  console.log(`🕐 ${label} PORTFOLIO REPORT GENERATION`);
  console.log(`   Time: ${now}`);
  console.log("============================================================");

  try {
    console.log("🚀 Starting daily report generation for all portfolios...");

    const result = await generateDailyReportsForAllPortfolios();
    // result = { success, failed, total, errors }

    console.log("");
    console.log("📊 Report Generation Summary:");
    console.log(`   Total portfolios: ${result.total}`);
    console.log(`   ✅ Successfully generated (incl. skipped-existing): ${result.success}`);
    console.log(`   ❌ Failed: ${result.failed}`);

    if (result.errors.length) {
      console.log("   ⚠️  Errors:");
      for (const err of result.errors) {
        console.log(`      - ${err}`);
      }
    }

    console.log("============================================================");
  } catch (err) {
    console.error("❌ Portfolio report job FAILED:", err);
    console.log("============================================================");
  }
}

export function schedule30MinutePortfolioReports() {
  console.log("============================================================");
  console.log("📅 30-MINUTE PORTFOLIO REPORT SCHEDULER INITIALIZED");
  console.log("⏰ Reports will be generated EVERY 30 MINUTES");
  console.log("⚠️  WARNING: This is for TESTING ONLY!");
  console.log("⚠️  For production, switch to the daily scheduler (1:00 AM).");
  console.log("============================================================");

  cron.schedule("*/30 * * * *", async () => {
    await executePortfolioReportJob("30-MINUTE");
  });
}

/**
 * OPTIONAL – extra helpers if you want different dev intervals
 */
export function schedule1MinutePortfolioReports() {
  cron.schedule("* * * * *", async () => {
    await executePortfolioReportJob("1-MINUTE");
  });
}

export function schedule2MinutePortfolioReports() {
  cron.schedule("*/2 * * * *", async () => {
    await executePortfolioReportJob("2-MINUTE");
  });
}

export function schedule5MinutePortfolioReports() {
  cron.schedule("*/5 * * * *", async () => {
    await executePortfolioReportJob("5-MINUTE");
  });
}

export function schedule10MinutePortfolioReports() {
  cron.schedule("*/10 * * * *", async () => {
    await executePortfolioReportJob("10-MINUTE");
  });
}

export function schedule30SecondPortfolioReports() {
  // node-cron can do seconds, but simplest fallback is setInterval.
  setInterval(() => {
    void executePortfolioReportJob("30-SECOND");
  }, 30 * 1000);
}

/**
 * PRODUCTION – once per day at 1:00 AM (server time)
 * Cron pattern: "0 1 * * *"
 */
export function scheduleDailyPortfolioReports() {
  console.log("============================================================");
  console.log("📅 DAILY PORTFOLIO REPORT SCHEDULER INITIALIZED");
  console.log("⏰ Reports will be generated EVERY DAY at 1:00 AM");
  console.log("============================================================");

  cron.schedule("0 1 * * *", async () => {
    await executePortfolioReportJob("DAILY");
  });
}

/**
 * Helper: choose schedule based on env
 * CRON_MODE=30-minute | 2-minute | 1-minute | 5-minute | 10-minute | 30-second | daily
 */
export function startPortfolioReportCronFromEnv() {
  if (process.env.NODE_ENV === "test") {
    console.log("🧪 Cron disabled in test environment.");
    return;
  }

  const mode = (process.env.CRON_MODE || "30-minute").toLowerCase();

  switch (mode) {
    case "daily":
      scheduleDailyPortfolioReports();
      break;
    case "1-minute":
    case "1min":
      schedule1MinutePortfolioReports();
      break;
    case "2-minute":
    case "2min":
      schedule2MinutePortfolioReports();
      break;
    case "5-minute":
    case "5min":
      schedule5MinutePortfolioReports();
      break;
    case "10-minute":
    case "10min":
      schedule10MinutePortfolioReports();
      break;
    case "30-second":
    case "30sec":
      schedule30SecondPortfolioReports();
      break;
    case "30-minute":
    case "30min":
    default:
      schedule30MinutePortfolioReports();
      break;
  }

  console.log(`🔁 Cron mode active: ${mode}`);
}