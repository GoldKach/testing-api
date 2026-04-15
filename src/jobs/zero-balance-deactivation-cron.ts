// src/jobs/zero-balance-deactivation-cron.ts
import cron from "node-cron";
import { db } from "@/db/db";
import { sendAccountDeactivatedEmail, sendAccountZeroBalanceWarningEmail } from "@/lib/mailer";
import { UserStatus } from "@prisma/client";

const ZERO_BALANCE_DAYS_THRESHOLD = 7;

interface ProcessResult {
  warningsSent: number;
  deactivated: number;
  skipped: number;
  errors: string[];
}

async function executeZeroBalanceJob(label: string): Promise<ProcessResult> {
  console.log("============================================================");
  console.log(`🕐 ${label} ZERO BALANCE DEACTIVATION CHECK`);
  console.log(`   Time: ${new Date().toISOString()}`);
  console.log(`   Threshold: ${ZERO_BALANCE_DAYS_THRESHOLD} days`);
  console.log("============================================================");

  const result: ProcessResult = {
    warningsSent: 0,
    deactivated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const activeUsers = await db.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        isApproved: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        name: true,
        zeroBalanceStartedAt: true,
        zeroBalanceWarningSentAt: true,
        masterWallet: {
          select: {
            id: true,
            balance: true,
          },
        },
        userPortfolios: {
          select: {
            wallet: {
              select: {
                balance: true,
              },
            },
          },
        },
      },
    });

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - ZERO_BALANCE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000);

    for (const user of activeUsers) {
      try {
        const masterBalance = user.masterWallet?.balance ?? 0;
        const portfolioBalances = user.userPortfolios.map((up) => up.wallet?.balance ?? 0);
        const hasZeroBalance = masterBalance === 0 && portfolioBalances.every((b) => b === 0);

        if (!hasZeroBalance) {
          if (user.zeroBalanceStartedAt) {
            await db.user.update({
              where: { id: user.id },
              data: {
                zeroBalanceStartedAt: null,
                zeroBalanceWarningSentAt: null,
              },
            });
            console.log(`   ✅ Reset zero-balance tracking for: ${user.email}`);
          }
          result.skipped++;
          continue;
        }

        const startDate = user.zeroBalanceStartedAt;

        if (!startDate) {
          await db.user.update({
            where: { id: user.id },
            data: { zeroBalanceStartedAt: now },
          });
          console.log(`   📊 Started zero-balance tracking for: ${user.email}`);
          result.skipped++;
          continue;
        }

        const daysSinceZeroBalance = Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));

        if (daysSinceZeroBalance >= ZERO_BALANCE_DAYS_THRESHOLD) {
          await db.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: user.id },
              data: { 
                status: UserStatus.DEACTIVATED,
                zeroBalanceStartedAt: null,
                zeroBalanceWarningSentAt: null,
              },
            });

            if (user.masterWallet) {
              await tx.masterWallet.update({
                where: { id: user.masterWallet.id },
                data: { status: "INACTIVE" as any },
              });
            }

            const portfolioWallets = await tx.portfolioWallet.findMany({
              where: {
                userPortfolio: {
                  userId: user.id,
                },
              },
            });

            for (const wallet of portfolioWallets) {
              await tx.portfolioWallet.update({
                where: { id: wallet.id },
                data: { status: "INACTIVE" as any },
              });
            }
          });

          try {
            await sendAccountDeactivatedEmail({
              to: user.email,
              name: user.firstName ?? user.name ?? "there",
              daysInactive: ZERO_BALANCE_DAYS_THRESHOLD,
            });
          } catch (emailError) {
            console.warn(`   ⚠️  Failed to send deactivation email to ${user.email}:`, emailError);
          }

          result.deactivated++;
          console.log(`   ✅ Deactivated: ${user.email} (after ${daysSinceZeroBalance} days)`);
        } else if (!user.zeroBalanceWarningSentAt || new Date(user.zeroBalanceWarningSentAt) < sevenDaysAgo) {
          const daysRemaining = ZERO_BALANCE_DAYS_THRESHOLD - daysSinceZeroBalance;

          try {
            await sendAccountZeroBalanceWarningEmail({
              to: user.email,
              name: user.firstName ?? user.name ?? "there",
              daysRemaining,
            });
          } catch (emailError) {
            console.warn(`   ⚠️  Failed to send warning email to ${user.email}:`, emailError);
          }

          await db.user.update({
            where: { id: user.id },
            data: { zeroBalanceWarningSentAt: now },
          });

          result.warningsSent++;
          console.log(`   📧 Sent warning to: ${user.email} (${daysRemaining} days remaining)`);
        } else {
          result.skipped++;
          console.log(`   ⏭️  Skipped: ${user.email} (warning already sent)`);
        }
      } catch (err) {
        const errorMsg = `Error processing ${user.email}: ${String(err)}`;
        result.errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);
      }
    }

    console.log("");
    console.log("📊 Zero Balance Job Summary:");
    console.log(`   📧 Warnings sent   : ${result.warningsSent}`);
    console.log(`   ✅ Deactivated     : ${result.deactivated}`);
    console.log(`   ⏭️  Skipped         : ${result.skipped}`);

    if (result.errors.length) {
      console.log("   ⚠️  Errors:");
      for (const err of result.errors) {
        console.log(`      - ${err}`);
      }
    }

    console.log("============================================================");
    return result;
  } catch (err) {
    console.error("❌ Zero balance job FAILED:", err);
    console.log("============================================================");
    result.errors.push(String(err));
    return result;
  }
}

export function scheduleDailyZeroBalanceCheck() {
  console.log("============================================================");
  console.log("📅 DAILY ZERO BALANCE CHECK SCHEDULER INITIALIZED");
  console.log(`⏰ Runs every day at 3:00 AM (server time)`);
  console.log(`   Threshold: ${ZERO_BALANCE_DAYS_THRESHOLD} days before deactivation`);
  console.log("============================================================");
  cron.schedule("0 3 * * *", async () => {
    await executeZeroBalanceJob("DAILY");
  });
}

export function schedule6HourZeroBalanceCheck() {
  console.log("============================================================");
  console.log("📅 6-HOUR ZERO BALANCE CHECK SCHEDULER INITIALIZED");
  console.log(`⏰ Runs every 6 hours`);
  console.log(`   Threshold: ${ZERO_BALANCE_DAYS_THRESHOLD} days before deactivation`);
  console.log("============================================================");
  cron.schedule("0 */6 * * *", async () => {
    await executeZeroBalanceJob("6-HOUR");
  });
}

export function scheduleHourlyZeroBalanceCheck() {
  console.log("============================================================");
  console.log("📅 HOURLY ZERO BALANCE CHECK SCHEDULER INITIALIZED");
  console.log(`⏰ Runs every hour — TESTING ONLY`);
  console.log(`   Threshold: ${ZERO_BALANCE_DAYS_THRESHOLD} days before deactivation`);
  console.log("⚠️  Switch to scheduleDailyZeroBalanceCheck() for production");
  console.log("============================================================");
  cron.schedule("0 * * * *", async () => {
    await executeZeroBalanceJob("HOURLY");
  });
}

export function startZeroBalanceDeactivationCronFromEnv() {
  if (process.env.NODE_ENV === "test") {
    console.log("🧪 Zero balance deactivation cron disabled in test environment.");
    return;
  }

  const mode = (process.env.ZERO_BALANCE_CRON_MODE || "daily").toLowerCase();

  switch (mode) {
    case "daily":
      scheduleDailyZeroBalanceCheck();
      break;
    case "6-hour":
    case "6hour":
    case "6hours":
      schedule6HourZeroBalanceCheck();
      break;
    case "hourly":
      scheduleHourlyZeroBalanceCheck();
      break;
    default:
      scheduleDailyZeroBalanceCheck();
      break;
  }

  console.log(`🔁 Zero balance check cron mode active: ${mode}`);
}

export { executeZeroBalanceJob };