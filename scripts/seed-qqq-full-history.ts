import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const db = new PrismaClient();
const CSV_PATH = "C:/Users/user/AppData/Local/Temp/qqq_history.csv";

async function main() {
  console.log("Looking up QQQ asset...");
  const qqq = await db.asset.findFirst({ where: { symbol: "QQQ" } });
  if (!qqq) {
    console.error("QQQ asset not found.");
    process.exit(1);
  }
  console.log(`Found QQQ — id: ${qqq.id}`);

  const lines = fs.readFileSync(CSV_PATH, "utf-8")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("Date") && !l.startsWith("Total"));

  console.log(`Upserting ${lines.length} price records (Jan 2023 – Sep 2025)...`);

  let success = 0;
  let failed = 0;

  for (const line of lines) {
    const [dateStr, priceStr] = line.split(",");
    if (!dateStr || !priceStr) continue;
    const closePrice = parseFloat(priceStr);
    const priceDate = new Date(dateStr + "T00:00:00.000Z");

    try {
      await db.assetPriceHistory.upsert({
        where:  { assetId_priceDate: { assetId: qqq.id, priceDate } },
        update: { closePrice },
        create: { assetId: qqq.id, priceDate, closePrice },
      });
      success++;
      process.stdout.write(`\r  ${success}/${lines.length} saved...`);
    } catch (err: any) {
      failed++;
      console.error(`\n  Failed ${dateStr}: ${err?.message}`);
    }
  }

  console.log(`\n\nDone. ${success} upserted, ${failed} failed.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
