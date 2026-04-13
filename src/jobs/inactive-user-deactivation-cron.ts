// src/jobs/inactive-user-deactivation-cron.ts
import cron from "node-cron";
import { db } from "@/db/db";
import { sendAccountDeactivatedEmail } from "@/lib/mailer";
import { UserStatus } from "@prisma/client";

const INACTIVITY_DAYS = 7;
const INACTIVITY_MS = INACTIVITY_DAYS * 24 * 60 * 60 * 1000;

interface DeactivationResult {
  total: number;
  deactivated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

async function executeInactiveUserDeactivation(label: string): Promise<DeactivationResult> {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - INACTIVITY_MS);

  console.log("============================================================");
  console.log(`🕐 ${label} INACTIVE USER DEACTIVATION`);
  console.log(`   Time: ${now.toISOString()}`);
  console.log(`   Inactivity threshold: ${INACTIVITY_DAYS} days`);
  console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
  console.log("============================================================");

  const result: DeactivationResult = {
    total: 0,
    deactivated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    const inactiveUsers = await db.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        masterWallet: {
          balance: 0,
          updatedAt: {
            lt: cutoffDate,
          },
        },
        isApproved: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        name: true,
        masterWallet: {
          select: {
            id: true,
            updatedAt: true,
            balance: true,
          },
        },
      },
    });

    result.total = inactiveUsers.length;

    if (inactiveUsers.length === 0) {
      console.log("📭 No inactive users found.");
      console.log("============================================================");
      return result;
    }

    console.log(`📋 Found ${inactiveUsers.length} inactive users to process.`);

    for (const user of inactiveUsers) {
      try {
        await db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: { status: UserStatus.DEACTIVATED },
          });

          if (user.masterWallet) {
            await tx.masterWallet.update({
              where: { id: user.masterWallet.id },
              data: { status: "INACTIVE" as any },
            });
          }
        });

        try {
          await sendAccountDeactivatedEmail({
            to: user.email,
            name: user.firstName ?? user.name ?? "there",
            daysInactive: INACTIVITY_DAYS,
          });
        } catch (emailError) {
          console.warn(`   ⚠️  Failed to send deactivation email to ${user.email}:`, emailError);
        }

        result.deactivated++;
        console.log(`   ✅ Deactivated: ${user.email} (${user.firstName ?? user.name})`);
      } catch (err) {
        result.failed++;
        const errorMsg = `Failed to deactivate ${user.email}: ${String(err)}`;
        result.errors.push(errorMsg);
        console.error(`   ❌ ${errorMsg}`);
      }
    }

    console.log("");
    console.log("📊 Deactivation Summary:");
    console.log(`   Total inactive users : ${result.total}`);
    console.log(`   ✅ Deactivated       : ${result.deactivated}`);
    console.log(`   ⏭️  Skipped          : ${result.skipped}`);
    console.log(`   ❌ Failed            : ${result.failed}`);

    if (result.errors.length) {
      console.log("   ⚠️  Errors:");
      for (const err of result.errors) {
        console.log(`      - ${err}`);
      }
    }

    console.log("============================================================");
    return result;
  } catch (err) {
    console.error("❌ Inactive user deactivation job FAILED:", err);
    console.log("============================================================");
    result.errors.push(String(err));
    return result;
  }
}

export function scheduleDailyInactiveUserDeactivation() {
  console.log("============================================================");
  console.log("📅 DAILY INACTIVE USER DEACTIVATION SCHEDULER INITIALIZED");
  console.log(`⏰ Runs every day at 2:00 AM (server time)`);
  console.log(`⏰ Inactivity threshold: ${INACTIVITY_DAYS} days`);
  console.log("============================================================");
  cron.schedule("0 2 * * *", async () => {
    await executeInactiveUserDeactivation("DAILY");
  });
}

export function schedule6HourInactiveUserDeactivation() {
  console.log("============================================================");
  console.log("📅 6-HOUR INACTIVE USER DEACTIVATION SCHEDULER INITIALIZED");
  console.log(`⏰ Runs every 6 hours`);
  console.log(`⏰ Inactivity threshold: ${INACTIVITY_DAYS} days`);
  console.log("============================================================");
  cron.schedule("0 */6 * * *", async () => {
    await executeInactiveUserDeactivation("6-HOUR");
  });
}

export function scheduleHourlyInactiveUserDeactivation() {
  console.log("============================================================");
  console.log("📅 HOURLY INACTIVE USER DEACTIVATION SCHEDULER INITIALIZED");
  console.log(`⏰ Runs every hour — TESTING ONLY`);
  console.log(`⏰ Inactivity threshold: ${INACTIVITY_DAYS} days`);
  console.log("⚠️  Switch to scheduleDailyInactiveUserDeactivation() for production");
  console.log("============================================================");
  cron.schedule("0 * * * *", async () => {
    await executeInactiveUserDeactivation("HOURLY");
  });
}

export function startInactiveUserDeactivationCronFromEnv() {
  if (process.env.NODE_ENV === "test") {
    console.log("🧪 Inactive user deactivation cron disabled in test environment.");
    return;
  }

  const mode = (process.env.INACTIVE_USER_CRON_MODE || "daily").toLowerCase();

  switch (mode) {
    case "daily":
      scheduleDailyInactiveUserDeactivation();
      break;
    case "6-hour":
    case "6hour":
    case "6hours":
      schedule6HourInactiveUserDeactivation();
      break;
    case "hourly":
      scheduleHourlyInactiveUserDeactivation();
      break;
    default:
      scheduleDailyInactiveUserDeactivation();
      break;
  }

  console.log(`🔁 Inactive user deactivation cron mode active: ${mode}`);
}

export { executeInactiveUserDeactivation };
