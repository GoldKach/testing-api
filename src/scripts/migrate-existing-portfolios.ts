/**
 * src/scripts/migrate-existing-portfolios.ts
 * Run: npx tsx src/scripts/migrate-existing-portfolios.ts
 */

import { PrismaClient } from "@prisma/client";
import { randomInt } from "crypto";

const db = new PrismaClient();

function generateAccountNumber(prefix: string): string {
  return `${prefix}${randomInt(1_000_000, 10_000_000)}`;
}

function toNum(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

async function getUniqueAccountNumber(
  prefix: string,
  model: "portfolioWallet" | "masterWallet"
): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const accountNumber = generateAccountNumber(prefix);
    const conflict =
      model === "portfolioWallet"
        ? await db.portfolioWallet.findUnique({ where: { accountNumber } })
        : await db.masterWallet.findFirst({ where: { accountNumber } });
    if (!conflict) return accountNumber;
  }
  throw new Error(`Could not generate unique account number for prefix ${prefix}`);
}

async function migrateExistingPortfolios() {
  console.log("🚀 Starting portfolio migration...\n");

  const defaultBankFee        = 30;
  const defaultTransactionFee = 10;
  const defaultFeeAtBank      = 10;
  const defaultTotalFees      = defaultBankFee + defaultTransactionFee + defaultFeeAtBank;

  const userPortfolios = await db.userPortfolio.findMany({
    include: {
      portfolio:  true,
      userAssets: { include: { asset: true } },
      user:       { include: { masterWallet: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${userPortfolios.length} UserPortfolio(s) to migrate.\n`);

  let migrated = 0;
  let upToDate = 0;
  let failed   = 0;
  const errors: string[] = [];

  for (const up of userPortfolios) {
    try {
      console.log(`\n── Processing: [${up.id}] user=${up.user.email} portfolio=${up.portfolio.name}`);

      const totalCostPrice  = up.userAssets.reduce((s, ua) => s + toNum(ua.costPrice),  0);
      const totalCloseValue = up.userAssets.reduce((s, ua) => s + toNum(ua.closeValue), 0);
      const totalLossGain   = up.userAssets.reduce((s, ua) => s + toNum(ua.lossGain),   0);
      const netAssetValue   = totalCloseValue - defaultTotalFees;

      const actions: string[] = [];

      await db.$transaction(async (tx) => {

        // 1. Backfill customName
        const patch: Record<string, any> = {};
        if (!up.customName || up.customName.trim() === "") {
          patch.customName = up.portfolio.name;
          actions.push(`Set customName`);
          console.log(`   ✏️  Setting customName = "${up.portfolio.name}"`);
        }

        // 2. Backfill totals
        if (toNum(up.totalInvested) === 0 && totalCostPrice > 0) {
          patch.totalInvested  = totalCostPrice;
          patch.totalLossGain  = totalLossGain;
          patch.portfolioValue = totalCloseValue;
          actions.push("Backfilled totals");
          console.log(`   💰 Backfilling totalInvested=${totalCostPrice.toFixed(2)}`);
        }

        if (Object.keys(patch).length) {
          await tx.userPortfolio.update({ where: { id: up.id }, data: patch });
        }

        // 3. Create PortfolioWallet if missing
        const existingWallet = await tx.portfolioWallet.findUnique({
          where: { userPortfolioId: up.id },
        });

        let walletId: string;

        if (!existingWallet) {
          const accountNumber = await getUniqueAccountNumber("GKP", "portfolioWallet");
          const wallet = await tx.portfolioWallet.create({
            data: {
              accountNumber,
              userPortfolioId: up.id,
              balance:         totalCostPrice,
              bankFee:         defaultBankFee,
              transactionFee:  defaultTransactionFee,
              feeAtBank:       defaultFeeAtBank,
              totalFees:       defaultTotalFees,
              netAssetValue,
              status:          "ACTIVE",
            },
          });
          walletId = wallet.id;
          actions.push("Created PortfolioWallet");
          console.log(`   🏦 Created PortfolioWallet [${wallet.id}] NAV=${netAssetValue.toFixed(2)}`);
        } else {
          walletId = existingWallet.id;
          console.log(`   🏦 PortfolioWallet already exists [${existingWallet.id}] — skipping`);
        }

        // 4. Create SubPortfolio gen=0 if missing
        const existingSub = await tx.subPortfolio.findFirst({
          where: { userPortfolioId: up.id, generation: 0 },
        });

        if (!existingSub) {
          const customName = up.customName?.trim() || up.portfolio.name;
          const sub = await tx.subPortfolio.create({
            data: {
              userPortfolioId: up.id,
              generation:      0,
              label:           `${customName} - Initial`,
              amountInvested:  totalCostPrice,
              totalCostPrice,
              totalCloseValue,
              totalLossGain,
              bankFee:         defaultBankFee,
              transactionFee:  defaultTransactionFee,
              feeAtBank:       defaultFeeAtBank,
              totalFees:       defaultTotalFees,
              cashAtBank:      0,
              snapshotDate:    up.createdAt,
            },
          });
          actions.push("Created SubPortfolio gen=0");
          console.log(`   📦 Created SubPortfolio gen=0 [${sub.id}]`);

          if (up.userAssets.length > 0) {
            await tx.subPortfolioAsset.createMany({
              data: up.userAssets.map((ua) => ({
                subPortfolioId:       sub.id,
                assetId:              ua.assetId,
                allocationPercentage: toNum(ua.allocationPercentage),
                costPerShare:         toNum(ua.costPerShare),
                costPrice:            toNum(ua.costPrice),
                stock:                toNum(ua.stock),
                closePrice:           toNum(ua.asset?.closePrice),
                closeValue:           toNum(ua.closeValue),
                lossGain:             toNum(ua.lossGain),
              })),
              skipDuplicates: true,
            });
            console.log(`   📊 Created ${up.userAssets.length} SubPortfolioAsset snapshot(s)`);
          }
        } else {
          console.log(`   📦 SubPortfolio gen=0 already exists [${existingSub.id}] — skipping`);
        }

        // 6. Create MasterWallet if missing
        if (!up.user.masterWallet) {
          const accountNumber = await getUniqueAccountNumber("GK", "masterWallet");
          const mw = await tx.masterWallet.create({
            data: {
              accountNumber,
              userId:         up.userId,
              totalDeposited: totalCostPrice,
              totalWithdrawn: 0,
              totalFees:      defaultTotalFees,
              netAssetValue,
              status:         "ACTIVE",
            },
          });
          actions.push("Created MasterWallet");
          console.log(`   💼 Created MasterWallet [${mw.id}]`);
        } else {
          console.log(`   💼 MasterWallet already exists [${up.user.masterWallet.id}] — skipping`);
        }
      });

      if (actions.length > 0) migrated++;
      else upToDate++;
      console.log(`   ✅ Done`);

    } catch (err: any) {
      failed++;
      const msg = `[${up.id}] ${up.user.email} — ${err.message}`;
      errors.push(msg);
      console.error(`   ❌ FAILED: ${msg}`);
    }
  }

  // Sync all MasterWallet NAVs
  console.log("\n🔄 Syncing all MasterWallet NAVs...");
  const allUsers = await db.user.findMany({
    where:  { masterWallet: { isNot: null } },
    select: { id: true, email: true },
  });

  for (const user of allUsers) {
    try {
      const wallets = await db.portfolioWallet.findMany({
        where:  { userPortfolio: { userId: user.id } },
        select: { netAssetValue: true, totalFees: true },
      });

      const totalNAV  = wallets.reduce((s, w) => s + toNum(w.netAssetValue), 0);
      const totalFees = wallets.reduce((s, w) => s + toNum(w.totalFees),     0);

      const [deposited, withdrawn] = await Promise.all([
        db.deposit.aggregate({
          where: { userId: user.id, transactionStatus: "APPROVED" },
          _sum:  { amount: true },
        }),
        db.withdrawal.aggregate({
          where: { userId: user.id, transactionStatus: "APPROVED" },
          _sum:  { amount: true },
        }),
      ]);

      await db.masterWallet.update({
        where: { userId: user.id },
        data: {
          netAssetValue:  totalNAV,
          totalFees,
          totalDeposited: deposited._sum.amount  ?? 0,
          totalWithdrawn: withdrawn._sum.amount ?? 0,
        },
      });

      console.log(`   ✅ Synced ${user.email} → NAV=${totalNAV.toFixed(2)}`);
    } catch (err: any) {
      console.error(`   ❌ Failed to sync ${user.email}: ${err.message}`);
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log("📋 Migration Summary");
  console.log("═".repeat(50));
  console.log(`   Total       : ${userPortfolios.length}`);
  console.log(`   ✅ Migrated  : ${migrated}`);
  console.log(`   ⏭️  Up to date: ${upToDate}`);
  console.log(`   ❌ Failed    : ${failed}`);
  if (errors.length) {
    console.log("\n   Errors:");
    errors.forEach((e) => console.log(`     • ${e}`));
  }
  console.log("═".repeat(50));

  await db.$disconnect();
}

migrateExistingPortfolios().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});