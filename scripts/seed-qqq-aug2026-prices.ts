import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const db = new PrismaClient();

// QQQ close prices — Jul 29 through Aug 14, 2026
// Source: screenshots shared by user (Close column only)
const QQQ_AUG2026: Array<[string, number]> = [
  // July 2026
  ["2026-07-29", 661.73],
  ["2026-07-30", 683.55],
  ["2026-07-31", 687.99],

  // August 2026
  ["2026-08-03", 700.07],
  ["2026-08-04", 723.85],
  ["2026-08-05", 717.30],
  ["2026-08-06", 714.65],
  ["2026-08-07", 723.03],
  ["2026-08-10", 720.87],
  ["2026-08-11", 718.45],
  ["2026-08-12", 723.70],
  ["2026-08-13", 732.07],
  ["2026-08-14", 731.07],
];

async function main() {
  console.log("Looking up QQQ asset...");

  const qqq = await db.asset.findFirst({ where: { symbol: "QQQ" } });
  if (!qqq) {
    console.error("QQQ asset not found. Create it in the admin dashboard first.");
    process.exit(1);
  }

  console.log(`Found QQQ — id: ${qqq.id}`);
  console.log(`Upserting ${QQQ_AUG2026.length} price records (Jul 29–Aug 14, 2026)...`);

  let success = 0;
  let failed  = 0;

  for (const [dateStr, closePrice] of QQQ_AUG2026) {
    const priceDate = new Date(dateStr + "T00:00:00.000Z");
    try {
      await db.assetPriceHistory.upsert({
        where:  { assetId_priceDate: { assetId: qqq.id, priceDate } },
        update: { closePrice },
        create: { assetId: qqq.id, priceDate, closePrice },
      });
      success++;
      process.stdout.write(`\r  ${success}/${QQQ_AUG2026.length} saved...`);
    } catch (err: any) {
      failed++;
      console.error(`\n  Failed ${dateStr}: ${err?.message}`);
    }
  }

  console.log(`\n\nDone. ${success} upserted, ${failed} failed.`);

  // Update live closePrice to the latest value (Aug 14, 2026)
  await db.asset.update({
    where: { id: qqq.id },
    data:  { closePrice: 731.07 },
  });
  console.log("Live closePrice updated to $731.07 (Aug 14, 2026).");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
