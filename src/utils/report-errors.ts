// Thrown by generatePortfolioReport when strict mode is enabled and one or more
// assets have no AssetPriceHistory row for the exact report date.
// Callers that generate reports for a specific date (not the daily cron) should
// catch this and surface the missing assets to the admin.
export class MissingHistoryPricesError extends Error {
  constructor(
    public readonly missingAssets: Array<{ assetId: string; symbol: string }>,
    public readonly reportDateStr: string,
  ) {
    super(
      `No close price in history for [${missingAssets.map((a) => a.symbol).join(", ")}] on ${reportDateStr}`,
    );
    this.name = "MissingHistoryPricesError";
  }
}
