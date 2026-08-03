import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const db = new PrismaClient();

// NFLX close prices from screenshot (Close column only)
const NFLX: Array<[string, number]> = [
  ["2026-07-31", 71.71],
  ["2026-07-30", 73.17],
  ["2026-07-29", 73.63],
  ["2026-07-28", 72.39],
  ["2026-07-27", 70.40],
  ["2026-07-24", 70.09],
  ["2026-07-23", 68.89],
  ["2026-07-22", 68.53],
  ["2026-07-21", 68.67],
  ["2026-07-20", 67.60],
  ["2026-07-17", 68.95],
  ["2026-07-16", 74.35],
  ["2026-07-15", 73.68],
  ["2026-07-14", 73.53],
  ["2026-07-13", 73.83],
  ["2026-07-10", 73.37],
  ["2026-07-09", 75.47],
  ["2026-07-08", 75.59],
  ["2026-07-07", 76.18],
  ["2026-07-06", 76.02],
];

async function main() {
  console.log("Looking up NFLX asset...");

  const nflx = await db.asset.findFirst({ where: { symbol: "NFLX" } });
  if (!nflx) {
    console.error("NFLX asset not found. Create it in the admin dashboard first.");
    process.exit(1);
  }

  console.log(`Found NFLX — id: ${nflx.id}`);
  console.log(`Upserting ${NFLX.length} price records...`);

  let success = 0;
  let failed  = 0;

  for (const [dateStr, closePrice] of NFLX) {
    const priceDate = new Date(dateStr + "T00:00:00.000Z");
    try {
      await db.assetPriceHistory.upsert({
        where:  { assetId_priceDate: { assetId: nflx.id, priceDate } },
        update: { closePrice },
        create: { assetId: nflx.id, priceDate, closePrice },
      });
      success++;
      process.stdout.write(`\r  ${success}/${NFLX.length} saved...`);
    } catch (err: any) {
      failed++;
      console.error(`\n  Failed ${dateStr}: ${err?.message}`);
    }
  }

  console.log(`\n\nDone. ${success} upserted, ${failed} failed.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
