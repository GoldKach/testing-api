// src/controllers/migrations.ts
import type { Request, Response } from "express";
import { db } from "@/db/db";
import { randomInt } from "crypto";

/* ------------------------------------------------------------------ */
/*  POST /migrations/reset-cost-per-share                              */
/*                                                                      */
/*  Admin-only. Idempotent — safe to call multiple times.              */
/*  Resets UserPortfolioAsset.costPerShare back to the original value  */
/*  stored in the generation=0 SubPortfolioAsset (the admin-set price  */
/*  from when the portfolio was first allocated).                       */
/*  Only touches portfolios that had top-ups (generation > 0 exists).  */
/*  Body: { dryRun?: boolean }                                         */
/* ------------------------------------------------------------------ */
export async function resetCostPerShareToOriginal(req: Request, res: Response) {
  try {
    const { dryRun = false } = (req.body ?? {}) as { dryRun?: boolean };

    // Find all portfolios that had at least one top-up
    const affectedPortfolios = await db.userPortfolio.findMany({
      where: {
        subPortfolios: { some: { generation: { gt: 0 } } },
      },
      include: {
        userAssets: {
          include: { asset: { select: { id: true, symbol: true } } },
        },
        subPortfolios: {
          where:   { generation: 0 },
          include: { assets: true },
        },
      },
    });

    const results: Array<{
      userPortfolioId: string;
      customName: string;
      changes: Array<{ assetId: string; symbol: string; from: number; to: number }>;
    }> = [];
    let totalUpdated = 0;

    for (const up of affectedPortfolios) {
      const gen0Sub = up.subPortfolios.find((s) => s.generation === 0);
      if (!gen0Sub) continue;

      // Build map: assetId → original admin-set costPerShare
      const originalPrices = new Map<string, number>();
      for (const spa of gen0Sub.assets) {
        originalPrices.set(spa.assetId, spa.costPerShare);
      }

      const changes: Array<{ assetId: string; symbol: string; from: number; to: number }> = [];

      for (const ua of up.userAssets) {
        const originalCPS = originalPrices.get(ua.assetId);
        if (originalCPS === undefined) continue;
        if (Math.abs(ua.costPerShare - originalCPS) < 0.0001) continue; // already correct

        changes.push({
          assetId: ua.assetId,
          symbol:  ua.asset.symbol,
          from:    ua.costPerShare,
          to:      originalCPS,
        });

        if (!dryRun) {
          await db.userPortfolioAsset.update({
            where: { id: ua.id },
            data:  { costPerShare: originalCPS },
          });
          totalUpdated++;
        }
      }

      if (changes.length > 0) {
        results.push({ userPortfolioId: up.id, customName: up.customName ?? up.id, changes });
      }
    }

    console.log("============================================================");
    console.log(`${dryRun ? "[DRY RUN] " : ""}RESET COST PER SHARE MIGRATION`);
    console.log(`  Portfolios affected : ${results.length}`);
    if (!dryRun) console.log(`  Asset rows updated  : ${totalUpdated}`);
    console.log("============================================================");

    return res.status(200).json({
      data: {
        dryRun,
        portfoliosAffected: results.length,
        ...(dryRun ? {} : { totalAssetsUpdated: totalUpdated }),
        details: results,
      },
      error: null,
      message: dryRun
        ? `Dry run: ${results.length} portfolio(s) have drifted costPerShare — no changes applied.`
        : `Reset complete: ${results.length} portfolio(s), ${totalUpdated} asset row(s) updated.`,
    });
  } catch (err: any) {
    console.error("resetCostPerShareToOriginal error:", err);
    return res.status(500).json({ data: null, error: "Migration failed: " + err.message });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /migrations/reset-cost-price                                  */
/*                                                                      */
/*  Admin-only. Idempotent — safe to call multiple times.              */
/*  Fixes UserPortfolioAsset.costPrice for portfolios that had         */
/*  redemptions: redemptions incorrectly reduced costPrice/totalInvested*/
/*  instead of absorbing the change through lossGain (investment return)*/
/*                                                                      */
/*  Correct totalInvested = gen-0 amount + all top-up amounts          */
/*  (redemption amounts are excluded — they come from investment return)*/
/*  Correct costPrice per asset = alloc% × correctTotalInvested        */
/*  Body: { dryRun?: boolean }                                         */
/* ------------------------------------------------------------------ */
export async function resetCostPriceAfterRedemptions(req: Request, res: Response) {
  try {
    const { dryRun = false } = (req.body ?? {}) as { dryRun?: boolean };

    // Only portfolios that have at least one redemption sub-portfolio
    // Redemption: generation > 0 AND topupEventId IS NULL (top-ups have topupEventId set)
    const affectedPortfolios = await db.userPortfolio.findMany({
      where: {
        subPortfolios: {
          some: { generation: { gt: 0 }, topupEventId: null },
        },
      },
      include: {
        userAssets: {
          include: { asset: { select: { id: true, symbol: true, closePrice: true } } },
        },
        subPortfolios: {
          select: { generation: true, amountInvested: true, topupEventId: true },
        },
        wallet: { select: { id: true, netAssetValue: true } },
      },
    });

    const results: Array<{
      userPortfolioId: string;
      customName: string;
      previousTotalInvested: number;
      correctTotalInvested: number;
      assetChanges: Array<{ assetId: string; symbol: string; costPriceFrom: number; costPriceTo: number; lossGainFrom: number; lossGainTo: number }>;
    }> = [];
    let totalAssetsUpdated = 0;

    for (const up of affectedPortfolios) {
      // Correct totalInvested = gen-0 + all top-up sub-portfolios (topupEventId IS NOT NULL)
      const correctTotalInvested = up.subPortfolios.reduce((sum, sp) => {
        const isOriginal = sp.generation === 0;
        const isTopup    = sp.topupEventId !== null;
        return sum + ((isOriginal || isTopup) ? Number(sp.amountInvested) : 0);
      }, 0);

      const previousTotalInvested = Number(up.totalInvested);
      if (Math.abs(correctTotalInvested - previousTotalInvested) < 0.01) continue; // already correct

      const assetChanges: Array<{
        id: string; assetId: string; symbol: string;
        costPriceFrom: number; costPriceTo: number;
        lossGainFrom: number; lossGainTo: number;
        newCloseValue: number;
      }> = [];

      for (const ua of up.userAssets) {
        const correctCostPrice = (ua.allocationPercentage / 100) * correctTotalInvested;
        const currentCloseValue = Number(ua.closeValue);
        const correctLossGain  = currentCloseValue - correctCostPrice;

        if (Math.abs(Number(ua.costPrice) - correctCostPrice) < 0.01) continue;

        assetChanges.push({
          id:            ua.id,
          assetId:       ua.assetId,
          symbol:        ua.asset.symbol,
          costPriceFrom: Number(ua.costPrice),
          costPriceTo:   correctCostPrice,
          lossGainFrom:  Number(ua.lossGain),
          lossGainTo:    correctLossGain,
          newCloseValue: currentCloseValue,
        });
      }

      if (!dryRun) {
        // Update each asset
        for (const ch of assetChanges) {
          await db.userPortfolioAsset.update({
            where: { id: ch.id },
            data:  { costPrice: ch.costPriceTo, lossGain: ch.lossGainTo },
          });
          totalAssetsUpdated++;
        }

        // Update portfolio totalInvested and totalLossGain
        const portfolioValue = Number(up.portfolioValue ?? 0);
        await db.userPortfolio.update({
          where: { id: up.id },
          data: {
            totalInvested: correctTotalInvested,
            totalLossGain: portfolioValue - correctTotalInvested,
          },
        });

        // Restore portfolio wallet netAssetValue to correct cost-basis NAV
        if (up.wallet) {
          await db.portfolioWallet.update({
            where: { id: up.wallet.id },
            data:  { netAssetValue: correctTotalInvested },
          });
        }
      }

      results.push({
        userPortfolioId:       up.id,
        customName:            up.customName ?? up.id,
        previousTotalInvested,
        correctTotalInvested,
        assetChanges: assetChanges.map(({ id: _id, newCloseValue: _cv, ...rest }) => rest),
      });
    }

    console.log("============================================================");
    console.log(`${dryRun ? "[DRY RUN] " : ""}RESET COST PRICE AFTER REDEMPTIONS`);
    console.log(`  Portfolios affected : ${results.length}`);
    if (!dryRun) console.log(`  Asset rows updated  : ${totalAssetsUpdated}`);
    console.log("============================================================");

    return res.status(200).json({
      data: {
        dryRun,
        portfoliosAffected: results.length,
        ...(dryRun ? {} : { totalAssetsUpdated }),
        details: results,
      },
      error: null,
      message: dryRun
        ? `Dry run: ${results.length} portfolio(s) have incorrect costPrice from past redemptions — no changes applied.`
        : `Reset complete: ${results.length} portfolio(s), ${totalAssetsUpdated} asset row(s) updated.`,
    });
  } catch (err: any) {
    console.error("resetCostPriceAfterRedemptions error:", err);
    return res.status(500).json({ data: null, error: "Migration failed: " + err.message });
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  POST /migrations/backfill-portfolios                               */
/*                                                                      */
/*  Admin-only. Idempotent — safe to call multiple times.              */
/*  Body: { dryRun?: boolean, defaultBankFee?: number,                 */
/*           defaultTransactionFee?: number, defaultFeeAtBank?: number }*/
/* ------------------------------------------------------------------ */
export async function backfillPortfoliosToNewStructure(req: Request, res: Response) {
  try {
    const {
      dryRun           = false,
      defaultBankFee        = 30,
      defaultTransactionFee = 10,
      defaultFeeAtBank      = 10,
    } = req.body as {
      dryRun?: boolean;
      defaultBankFee?: number;
      defaultTransactionFee?: number;
      defaultFeeAtBank?: number;
    };

    const defaultTotalFees = defaultBankFee + defaultTransactionFee + defaultFeeAtBank;

    // ── Load all UserPortfolios with full relations ──────────────────
    const userPortfolios = await db.userPortfolio.findMany({
      include: {
        portfolio:  true,
        userAssets: { include: { asset: true } },
        user:       { include: { masterWallet: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const results: {
      userPortfolioId: string;
      userEmail:       string;
      portfolioName:   string;
      actions:         string[];
      status:          "migrated" | "already_up_to_date" | "failed";
      error?:          string;
    }[] = [];

    for (const up of userPortfolios) {
      const actions: string[] = [];

      try {
        const totalCostPrice  = up.userAssets.reduce((s, ua) => s + toNum(ua.costPrice),  0);
        const totalCloseValue = up.userAssets.reduce((s, ua) => s + toNum(ua.closeValue), 0);
        const totalLossGain   = up.userAssets.reduce((s, ua) => s + toNum(ua.lossGain),   0);
        const netAssetValue   = totalCloseValue - defaultTotalFees;

        if (!dryRun) {
          await db.$transaction(async (tx) => {

            // ── 1. Backfill customName ─────────────────────────────
            const patch: Record<string, any> = {};
            if (!up.customName || up.customName.trim() === "") {
              patch.customName = up.portfolio.name;
              actions.push(`Set customName = "${up.portfolio.name}"`);
            }

            // ── 2. Backfill portfolio value totals ─────────────────
            if (toNum(up.totalInvested) === 0 && totalCostPrice > 0) {
              patch.totalInvested  = totalCostPrice;
              patch.totalLossGain  = totalLossGain;
              patch.portfolioValue = totalCloseValue;
              actions.push(`Backfilled totalInvested=${totalCostPrice.toFixed(2)}`);
            }

            if (Object.keys(patch).length) {
              await tx.userPortfolio.update({ where: { id: up.id }, data: patch });
            }

            // ── 3. Create PortfolioWallet if missing ───────────────
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
              actions.push(`Created PortfolioWallet [${wallet.id}]`);
            } else {
              walletId = existingWallet.id;
            }

            // ── 4. Create SubPortfolio generation=0 if missing ─────
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
              actions.push(`Created SubPortfolio gen=0 [${sub.id}]`);

              // ── 5. Create SubPortfolioAsset snapshots ────────────
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
                actions.push(`Created ${up.userAssets.length} SubPortfolioAsset snapshot(s)`);
              }
            }

            // ── 6. Create MasterWallet if missing ──────────────────
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
              actions.push(`Created MasterWallet [${mw.id}]`);
            }
          });
        } else {
          // Dry run — just report what would happen
          if (!up.customName || up.customName.trim() === "")
            actions.push(`Would set customName = "${up.portfolio.name}"`);
          if (toNum(up.totalInvested) === 0 && totalCostPrice > 0)
            actions.push(`Would backfill totalInvested=${totalCostPrice.toFixed(2)}`);

          const existingWallet = await db.portfolioWallet.findUnique({ where: { userPortfolioId: up.id } });
          if (!existingWallet) actions.push("Would create PortfolioWallet");

          const existingSub = await db.subPortfolio.findFirst({ where: { userPortfolioId: up.id, generation: 0 } });
          if (!existingSub)   actions.push(`Would create SubPortfolio gen=0 + ${up.userAssets.length} asset snapshot(s)`);

          if (!up.user.masterWallet) actions.push("Would create MasterWallet");
        }

        results.push({
          userPortfolioId: up.id,
          userEmail:       up.user.email,
          portfolioName:   up.portfolio.name,
          actions,
          status: actions.length > 0 ? "migrated" : "already_up_to_date",
        });

      } catch (err: any) {
        results.push({
          userPortfolioId: up.id,
          userEmail:       up.user.email,
          portfolioName:   up.portfolio.name,
          actions,
          status: "failed",
          error:  err.message,
        });
      }
    }

    // ── Sync all MasterWallet NAVs ─────────────────────────────────
    if (!dryRun) {
      const allUsers = await db.user.findMany({
        where:  { masterWallet: { isNot: null } },
        select: { id: true },
      });

      for (const user of allUsers) {
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
      }
    }

    // ── Summary ────────────────────────────────────────────────────
    const summary = {
      total:            results.length,
      migrated:         results.filter((r) => r.status === "migrated").length,
      already_up_to_date: results.filter((r) => r.status === "already_up_to_date").length,
      failed:           results.filter((r) => r.status === "failed").length,
      dryRun,
    };

    const statusCode = summary.failed > 0 ? 207 : 200;

    return res.status(statusCode).json({
      data: { summary, results },
      error: summary.failed > 0 ? `${summary.failed} portfolio(s) failed to migrate` : null,
    });

  } catch (err: any) {
    console.error("backfillPortfoliosToNewStructure error:", err);
    return res.status(500).json({ data: null, error: "Migration failed: " + err.message });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /migrations/reactivate-all-users                              */
/*                                                                      */
/*  Reactivates ALL deactivated/inactive users and their wallets.      */
/*  Also clears zero-balance tracking fields.                          */
/*  Idempotent — safe to call multiple times.                          */
/* ------------------------------------------------------------------ */
export async function reactivateAllUsers(req: Request, res: Response) {
  try {
    // 1. Reactivate all non-ACTIVE users (DEACTIVATED, INACTIVE, SUSPENDED)
    const usersResult = await db.user.updateMany({
      where: {
        status: { in: ["DEACTIVATED", "INACTIVE", "SUSPENDED"] as any[] },
      },
      data: {
        status: "ACTIVE" as any,
        zeroBalanceStartedAt:    null,
        zeroBalanceWarningSentAt: null,
      },
    });

    // 2. Reactivate all INACTIVE master wallets
    const masterWalletsResult = await db.masterWallet.updateMany({
      where: { status: { in: ["INACTIVE", "FROZEN", "CLOSED"] as any[] } },
      data:  { status: "ACTIVE" as any },
    });

    // 3. Reactivate all INACTIVE portfolio wallets
    const portfolioWalletsResult = await db.portfolioWallet.updateMany({
      where: { status: { in: ["INACTIVE", "FROZEN", "CLOSED"] as any[] } },
      data:  { status: "ACTIVE" as any },
    });

    console.log("============================================================");
    console.log("✅ REACTIVATE ALL USERS MIGRATION COMPLETE");
    console.log(`   Users reactivated         : ${usersResult.count}`);
    console.log(`   Master wallets reactivated : ${masterWalletsResult.count}`);
    console.log(`   Portfolio wallets reactivated: ${portfolioWalletsResult.count}`);
    console.log("============================================================");

    return res.status(200).json({
      data: {
        usersReactivated:          usersResult.count,
        masterWalletsReactivated:  masterWalletsResult.count,
        portfolioWalletsReactivated: portfolioWalletsResult.count,
      },
      error: null,
      message: `Reactivated ${usersResult.count} user(s), ${masterWalletsResult.count} master wallet(s), ${portfolioWalletsResult.count} portfolio wallet(s).`,
    });
  } catch (err: any) {
    console.error("reactivateAllUsers error:", err);
    return res.status(500).json({ data: null, error: "Reactivation failed: " + err.message });
  }
}
