// src/utils/cascade.ts
import { db } from "@/db/db";

/**
 * Upserts one AssetPriceHistory row per asset for the given trading date (defaults to today UTC).
 * Called fire-and-forget alongside cascadeClosePriceUpdates so every price change is recorded.
 */
export async function recordAssetPriceHistory(
  updates: Array<{ assetId: string; closePrice: number }>,
  priceDate?: Date,
): Promise<void> {
  if (updates.length === 0) return;
  const date = new Date(priceDate ?? new Date());
  date.setUTCHours(0, 0, 0, 0); // normalize to midnight UTC

  for (const u of updates) {
    try {
      await db.assetPriceHistory.upsert({
        where:  { assetId_priceDate: { assetId: u.assetId, priceDate: date } },
        update: { closePrice: u.closePrice },
        create: { assetId: u.assetId, priceDate: date, closePrice: u.closePrice },
      });
    } catch (err) {
      console.error(`[recordAssetPriceHistory] assetId=${u.assetId}`, err);
    }
  }
  console.log(`[recordAssetPriceHistory] recorded ${updates.length} price(s) for ${date.toISOString().slice(0, 10)}`);
}

/**
 * Propagates close price changes across all client portfolios that hold the affected assets.
 * Designed to run as a background fire-and-forget after the HTTP response is sent.
 *
 * Chain:
 *   asset.closePrice  →  UserPortfolioAsset.{closeValue, lossGain}
 *                    →  UserPortfolio.{portfolioValue, totalLossGain}
 *                    →  MasterWallet.netAssetValue  (= Σ portfolioValue, market value)
 *
 * Invariants:
 *   - portfolioWallet.netAssetValue is cost-basis NAV — never touched here
 *   - masterWallet.netAssetValue    = Σ userPortfolio.portfolioValue (market value)
 */
export async function cascadeClosePriceUpdates(
  updates: Array<{ assetId: string; closePrice: number }>
) {
  if (updates.length === 0) return;

  const priceMap = new Map(updates.map((u) => [u.assetId, u.closePrice]));
  const assetIds = [...priceMap.keys()];

  console.log(`[cascade] starting for ${assetIds.length} asset(s):`, assetIds);

  // ── Step 1: fetch all affected records ─────────────────────────────
  let portfolioAssets: Array<{ id: string; assetId: string; stock: any; costPrice: any }> = [];
  let userAssets: Array<{ id: string; assetId: string; stock: any; costPrice: any; userPortfolioId: string }> = [];

  try {
    [portfolioAssets, userAssets] = await Promise.all([
      db.portfolioAsset.findMany({
        where:  { assetId: { in: assetIds } },
        select: { id: true, assetId: true, stock: true, costPrice: true },
      }),
      db.userPortfolioAsset.findMany({
        where:  { assetId: { in: assetIds } },
        select: { id: true, assetId: true, stock: true, costPrice: true, userPortfolioId: true },
      }),
    ]);
    console.log(`[cascade] step1: found ${portfolioAssets.length} portfolioAssets, ${userAssets.length} userAssets`);
  } catch (err) {
    console.error("[cascade] step1 FAILED — aborting:", err);
    return;
  }

  // ── Step 2: update template PortfolioAssets ─────────────────────────
  let step2ok = 0;
  for (const pa of portfolioAssets) {
    try {
      const newClose   = priceMap.get(pa.assetId)!;
      const closeValue = newClose * Number(pa.stock);
      await db.portfolioAsset.update({
        where: { id: pa.id },
        data:  { closeValue, lossGain: closeValue - Number(pa.costPrice ?? 0) },
      });
      step2ok++;
    } catch (err) {
      console.error(`[cascade] step2 portfolioAsset id=${pa.id} FAILED:`, err);
    }
  }
  console.log(`[cascade] step2: updated ${step2ok}/${portfolioAssets.length} portfolioAssets`);

  // ── Step 3: update every UserPortfolioAsset ─────────────────────────
  // Only closeValue and lossGain — closePrice lives on Asset, not this model
  let step3ok = 0;
  for (const ua of userAssets) {
    try {
      const newClose   = priceMap.get(ua.assetId)!;
      const closeValue = newClose * Number(ua.stock);
      await db.userPortfolioAsset.update({
        where: { id: ua.id },
        data:  { closeValue, lossGain: closeValue - Number(ua.costPrice ?? 0) },
      });
      step3ok++;
    } catch (err) {
      console.error(`[cascade] step3 userPortfolioAsset id=${ua.id} FAILED:`, err);
    }
  }
  console.log(`[cascade] step3: updated ${step3ok}/${userAssets.length} userPortfolioAssets`);

  // ── Step 4: recompute each affected UserPortfolio ───────────────────
  const affectedPortfolioIds = [...new Set(userAssets.map((ua) => ua.userPortfolioId))];
  const affectedUserIds      = new Set<string>();
  let step4ok = 0;

  for (const upId of affectedPortfolioIds) {
    try {
      const allAssets = await db.userPortfolioAsset.findMany({
        where:  { userPortfolioId: upId },
        select: { closeValue: true },
      });
      const portfolioValue = allAssets.reduce((s, r) => s + Number(r.closeValue ?? 0), 0);

      const up = await db.userPortfolio.findUnique({
        where:  { id: upId },
        select: { totalInvested: true, userId: true },
      });
      if (!up) {
        console.warn(`[cascade] step4 userPortfolio id=${upId} not found — skipping`);
        continue;
      }

      affectedUserIds.add(up.userId);
      const totalLossGain = portfolioValue - Number(up.totalInvested ?? 0);

      await db.userPortfolio.update({
        where: { id: upId },
        data:  { portfolioValue, totalLossGain },
      });
      step4ok++;
      console.log(`[cascade] step4 portfolio=${upId} portfolioValue=${portfolioValue.toFixed(2)} totalLossGain=${totalLossGain.toFixed(2)}`);
    } catch (err) {
      console.error(`[cascade] step4 userPortfolio id=${upId} FAILED:`, err);
    }
  }
  console.log(`[cascade] step4: updated ${step4ok}/${affectedPortfolioIds.length} userPortfolios`);

  // ── Step 5: sync MasterWallet.netAssetValue for each affected user ──
  let step5ok = 0;
  for (const userId of affectedUserIds) {
    try {
      const portfolios = await db.userPortfolio.findMany({
        where:  { userId },
        select: { portfolioValue: true },
      });
      const totalMarketValue = portfolios.reduce((s, p) => s + Number(p.portfolioValue ?? 0), 0);
      await db.masterWallet.updateMany({
        where: { userId },
        data:  { netAssetValue: totalMarketValue },
      });
      step5ok++;
      console.log(`[cascade] step5 user=${userId} masterWallet.netAssetValue=${totalMarketValue.toFixed(2)}`);
    } catch (err) {
      console.error(`[cascade] step5 userId=${userId} FAILED:`, err);
    }
  }
  console.log(`[cascade] step5: updated ${step5ok}/${affectedUserIds.size} masterWallets`);

  console.log(`[cascade] COMPLETE`);
}
