// src/jobs/portfolio-report-cron.ts
import cron from "node-cron";
import {
  generateDailyReportsForAllPortfolios,
  regenerateDailyReportsForAllPortfolios,
  generateDailyReportsForUser,
} from "@/controllers/portfolio-performance-reports";
import { db } from "@/db/db";
import { recordAssetPriceHistory } from "@/utils/cascade";

// East African Time is UTC+3
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

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
/*  Internal executor — force-regen (4 PM EAT job)                     */
/* ------------------------------------------------------------------ */

async function executeRegenReportJob(label: string) {
  const now = new Date().toISOString();

  console.log("============================================================");
  console.log(`🔄 ${label} PORTFOLIO REPORT REGENERATION`);
  console.log(`   Time: ${now}`);
  console.log("============================================================");

  try {
    const result = await regenerateDailyReportsForAllPortfolios();

    console.log("");
    console.log("📊 Report Regeneration Summary:");
    console.log(`   Total portfolios : ${result.total}`);
    console.log(`   ✅ Regenerated   : ${result.success}`);
    console.log(`   ❌ Failed        : ${result.failed}`);

    if (result.errors.length) {
      console.log("   ⚠️  Errors:");
      for (const err of result.errors) {
        console.log(`      - ${err}`);
      }
    }

    console.log("============================================================");
  } catch (err) {
    console.error("❌ Portfolio regen job FAILED:", err);
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
 * Snapshots all current live asset close prices into AssetPriceHistory for today (UTC date).
 * Called before daily report generation so reports use the captured midday prices,
 * and future date lookups return the exact price as it was at report time.
 */
export async function snapshotLivePricesForToday() {
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  const assets = await db.asset.findMany({
    select: { id: true, symbol: true, closePrice: true },
  });

  const updates = assets
    .filter((a) => a.closePrice !== null && a.closePrice !== undefined)
    .map((a) => ({ assetId: a.id, closePrice: Number(a.closePrice) }));

  if (updates.length === 0) {
    console.log("   [price-snapshot] No assets with prices — skipped.");
    return;
  }

  await recordAssetPriceHistory(updates, todayUTC);
  console.log(`   [price-snapshot] Recorded ${updates.length} live price(s) for ${todayUTC.toISOString().slice(0, 10)}`);
}

/**
 * PRODUCTION — once per day at 11:00 AM EAT (08:00 UTC).
 * Step 1: snapshot all live close prices for today into AssetPriceHistory.
 * Step 2: generate portfolio performance reports (which read from AssetPriceHistory).
 * Running at 11 AM EAT ensures the admin has had time to enter the correct
 * close prices before reports are generated, avoiding stale midnight prices.
 */
export function scheduleDailyPortfolioReports() {
  console.log("============================================================");
  console.log("📅 DAILY PORTFOLIO REPORT SCHEDULER INITIALIZED");
  console.log("⏰ Snapshot + reports every day at 11:00 AM EAT (08:00 UTC)");
  console.log("============================================================");
  cron.schedule("0 8 * * *", async () => {
    console.log("============================================================");
    console.log("📸 Step 1 — Snapshotting live prices for today (11 AM EAT)");
    console.log("============================================================");
    await snapshotLivePricesForToday();
    await executePortfolioReportJob("DAILY");
  });
}

/**
 * Snapshot all asset close prices into AssetPriceHistory every midnight EAT (21:00 UTC).
 * Stores the price under the EAT calendar date so historical report queries find the correct price.
 */
export function scheduleEATMidnightPriceSnapshot() {
  console.log("============================================================");
  console.log("📸 EAT MIDNIGHT PRICE SNAPSHOT SCHEDULER INITIALIZED");
  console.log("⏰ Snapshot every day at 00:00 EAT (21:00 UTC)");
  console.log("============================================================");

  // 21:00 UTC = 00:00 EAT (the start of the next EAT calendar day)
  cron.schedule("0 21 * * *", async () => {
    const startedAt = new Date().toISOString();
    console.log("============================================================");
    console.log(`📸 ASSET PRICE SNAPSHOT — midnight EAT`);
    console.log(`   Started: ${startedAt}`);
    console.log("============================================================");

    try {
      // At 21:00 UTC, the EAT clock reads 00:00 of the *next* UTC day.
      const nowUTC = new Date();
      const nowEAT = new Date(nowUTC.getTime() + EAT_OFFSET_MS);
      // EAT date as UTC midnight — this is the date to record prices against.
      const eatDateUTC = new Date(
        Date.UTC(nowEAT.getUTCFullYear(), nowEAT.getUTCMonth(), nowEAT.getUTCDate())
      );

      const assets = await db.asset.findMany({
        select: { id: true, symbol: true, closePrice: true },
      });

      const prices = assets
        .filter((a) => a.closePrice !== null && a.closePrice !== undefined)
        .map((a) => ({ assetId: a.id, closePrice: Number(a.closePrice) }));

      if (prices.length === 0) {
        console.log("   No assets with close prices found — skipping snapshot.");
        return;
      }

      await recordAssetPriceHistory(prices, eatDateUTC);

      console.log(`   ✅ Snapshotted ${prices.length} asset prices for EAT date ${eatDateUTC.toISOString().slice(0, 10)}`);
      console.log("============================================================");
    } catch (err) {
      console.error("❌ Price snapshot FAILED:", err);
      console.log("============================================================");
    }
  });
}

/**
 * PRODUCTION — force-regenerates all reports at 5:30 PM EAT (14:30 UTC) every day.
 * Deletes any existing report for today then saves a fresh snapshot so the stored
 * record always reflects the most up-to-date prices at that moment.
 * This runs in addition to (not instead of) the 11 AM initial generation.
 */
export function schedule530PMEATDailyRegen() {
  console.log("============================================================");
  console.log("🔄 5:30 PM EAT AUTO-REGEN SCHEDULER INITIALIZED");
  console.log("⏰ Force-regenerate all reports at 5:30 PM EAT (14:30 UTC)");
  console.log("============================================================");
  cron.schedule("30 14 * * *", async () => {
    console.log("============================================================");
    console.log("📸 Step 1 — Snapshotting live prices for today (5:30 PM EAT)");
    console.log("============================================================");
    await snapshotLivePricesForToday();
    await executeRegenReportJob("530PM-EAT-REGEN");
  });
}

/**
 * Choose schedule based on CRON_MODE env variable.
 * CRON_MODE=daily | 30-minute | 10-minute | 5-minute | 2-minute | 1-minute | 30-second
 *
 * Note: the midnight EAT price snapshot (scheduleEATMidnightPriceSnapshot) is NOT
 * started here. It was writing stale previous-day prices under today's date at
 * midnight before the admin had a chance to update close prices. The 11 AM EAT
 * daily job (scheduleDailyPortfolioReports) snapshots prices at the right time.
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

  // Always register the 5:30 PM EAT force-regen regardless of CRON_MODE —
  // it fires once per day at a fixed wall-clock time, not on a dev interval.
  schedule530PMEATDailyRegen();

  console.log(`🔁 Cron mode active: ${mode}`);
}