-- AddTable: AssetPriceHistory
-- Stores one row per asset per trading date so reports can use the price
-- that was valid on a specific date rather than the current live price.
-- This is purely additive — no existing tables or data are modified.

CREATE TABLE "AssetPriceHistory" (
    "id"         TEXT NOT NULL,
    "assetId"    TEXT NOT NULL,
    "priceDate"  TIMESTAMP(3) NOT NULL,
    "closePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetPriceHistory_pkey" PRIMARY KEY ("id")
);

-- Unique: one close price per asset per day
CREATE UNIQUE INDEX "AssetPriceHistory_assetId_priceDate_key"
    ON "AssetPriceHistory"("assetId", "priceDate");

-- Composite index for the common query pattern: assetId + priceDate range
CREATE INDEX "AssetPriceHistory_assetId_priceDate_idx"
    ON "AssetPriceHistory"("assetId", "priceDate");

-- FK to Asset (cascade delete so history is cleaned up if asset is removed)
ALTER TABLE "AssetPriceHistory"
    ADD CONSTRAINT "AssetPriceHistory_assetId_fkey"
    FOREIGN KEY ("assetId")
    REFERENCES "Asset"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: create today's price history from current Asset.closePrice values
-- so reports generated today already have a stored historical record.
INSERT INTO "AssetPriceHistory" ("id", "assetId", "priceDate", "closePrice", "createdAt")
SELECT
    gen_random_uuid()::text,
    "id",
    date_trunc('day', NOW() AT TIME ZONE 'UTC'),
    "closePrice",
    NOW()
FROM "Asset"
WHERE "closePrice" > 0
ON CONFLICT ("assetId", "priceDate") DO NOTHING;
