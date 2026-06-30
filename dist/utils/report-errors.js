"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingHistoryPricesError = void 0;
class MissingHistoryPricesError extends Error {
    constructor(missingAssets, reportDateStr) {
        super(`No close price in history for [${missingAssets.map((a) => a.symbol).join(", ")}] on ${reportDateStr}`);
        this.missingAssets = missingAssets;
        this.reportDateStr = reportDateStr;
        this.name = "MissingHistoryPricesError";
    }
}
exports.MissingHistoryPricesError = MissingHistoryPricesError;
