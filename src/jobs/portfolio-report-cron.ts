// src/jobs/portfolio-report-cron.ts
import cron from "node-cron";
import { generateDailyReportsForAllPortfolios } from "@/controllers/portfolio-performance-reports";
import { generateDailyReportsForUser } from "@/controllers/portfolio-performance-reports";

/* ------------------------------------------------------------------ */
/*  Internal executor — system-wide (all active portfolios)            */
/* ------------------------------------------------------------------ */

async function executePortfolioReportJob(label: string) {
  const now = new Date().toISOString();

  console.log("============================================================");
  console.log(`🕐 ${label} PORTFOLIO REPORT GENERATION`);
  console.log(`   Time: ${now}`);
  console.log("============================================================");

  try {
    const result = await generateDailyReportsForAllPortfolios();

    console.log("");
    console.log("📊 Report Generation Summary:");
    console.log(`   Total portfolios : ${result.total}`);
    console.log(`   ✅ Success        : ${result.success}`);
    console.log(`   ❌ Failed         : ${result.failed}`);

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

/* ------------------------------------------------------------------ */
/*  Per-user executor                                                   */
/*  Call this after a deposit/topup approval to immediately generate   */
/*  fresh reports for all of that user's active portfolios.            */
/* ------------------------------------------------------------------ */

export async function executeUserPortfolioReportJob(userId: string) {
  console.log("============================================================");
  console.log(`🕐 USER PORTFOLIO REPORT GENERATION`);
  console.log(`   User  : ${userId}`);
  console.log(`   Time  : ${new Date().toISOString()}`);
  console.log("============================================================");

  try {
    const result = await generateDailyReportsForUser(userId);

    console.log("");
    console.log("📊 User Report Summary:");
    console.log(`   Total portfolios : ${result.total}`);
    console.log(`   ✅ Success        : ${result.success}`);
    console.log(`   ⏭️  Skipped        : ${result.skipped}`);
    console.log(`   ❌ Failed         : ${result.failed}`);

    if (result.errors.length) {
      console.log("   ⚠️  Errors:");
      for (const err of result.errors) {
        console.log(`      - ${err}`);
      }
    }

    console.log("============================================================");
    return result;
  } catch (err) {
    console.error(`❌ User report job FAILED for [${userId}]:`, err);
    console.log("============================================================");
    return { total: 0, success: 0, skipped: 0, failed: 1, errors: [String(err)] };
  }
}

/* ------------------------------------------------------------------ */
/*  Schedules                                                           */
/* ------------------------------------------------------------------ */

export function schedule30MinutePortfolioReports() {
  console.log("============================================================");
  console.log("📅 30-MINUTE PORTFOLIO REPORT SCHEDULER INITIALIZED");
  console.log("⏰ Reports every 30 minutes — TESTING ONLY");
  console.log("⚠️  Switch to scheduleDailyPortfolioReports() for production");
  console.log("============================================================");
  cron.schedule("*/30 * * * *", async () => {
    await executePortfolioReportJob("30-MINUTE");
  });
}

export function schedule1MinutePortfolioReports() {
  console.log("============================================================");
  console.log("📅 1-MINUTE PORTFOLIO REPORT SCHEDULER INITIALIZED");
  console.log("⏰ Reports every 1 minute — TESTING ONLY");
  console.log("⚠️  Switch to scheduleDailyPortfolioReports() for production");
  console.log("============================================================");
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
  setInterval(() => {
    void executePortfolioReportJob("30-SECOND");
  }, 30 * 1000);
}

/**
 * PRODUCTION — once per day at 1:00 AM (server time)
 */
export function scheduleDailyPortfolioReports() {
  console.log("============================================================");
  console.log("📅 DAILY PORTFOLIO REPORT SCHEDULER INITIALIZED");
  console.log("⏰ Reports every day at 1:00 AM");
  console.log("============================================================");
  cron.schedule("0 1 * * *", async () => {
    await executePortfolioReportJob("DAILY");
  });
}

/**
 * Choose schedule based on CRON_MODE env variable.
 * CRON_MODE=daily | 30-minute | 10-minute | 5-minute | 2-minute | 1-minute | 30-second
 */
export function startPortfolioReportCronFromEnv() {
  if (process.env.NODE_ENV === "test") {
    console.log("🧪 Cron disabled in test environment.");
    return;
  }

  const mode = (process.env.CRON_MODE || "1-minute").toLowerCase();

  switch (mode) {
    case "daily":                   scheduleDailyPortfolioReports();      break;
    case "1-minute": case "1min":   schedule1MinutePortfolioReports();    break;
    case "2-minute": case "2min":   schedule2MinutePortfolioReports();    break;
    case "5-minute": case "5min":   schedule5MinutePortfolioReports();    break;
    case "10-minute": case "10min": schedule10MinutePortfolioReports();   break;
    case "30-second": case "30sec": schedule30SecondPortfolioReports();   break;
    case "30-minute": case "30min":
    default:
      schedule30MinutePortfolioReports();
      break;
  }

  console.log(`🔁 Cron mode active: ${mode}`);
}