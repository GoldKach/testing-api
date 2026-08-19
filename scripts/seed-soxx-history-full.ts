import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const db = new PrismaClient();
const CSV_PATH = "C:/Users/user/AppData/Local/Temp/soxx_history_full.csv";

async function main() {
  const soxx = await db.asset.findFirst({ where: { symbol: "SOXX" } });
  if (!soxx) { console.error("SOXX not found."); process.exit(1); }
  console.log(`Found SOXX — id: ${soxx.id}`);

  const lines = fs.readFileSync(CSV_PATH, "utf-8")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && /^\d{4}-\d{2}-\d{2},/.test(l));

  console.log(`Upserting ${lines.length} price records (Jan 2023 – Aug 2026)...`);

  let success = 0, failed = 0;

  for (const line of lines) {
    const [dateStr, priceStr] = line.split(",");
    const closePrice = parseFloat(priceStr);
    const priceDate  = new Date(dateStr + "T00:00:00.000Z");
    try {
      await db.assetPriceHistory.upsert({
        where:  { assetId_priceDate: { assetId: soxx.id, priceDate } },
        update: { closePrice },
        create: { assetId: soxx.id, priceDate, closePrice },
      });
      success++;
      process.stdout.write(`\r  ${success}/${lines.length} saved...`);
    } catch (err: any) {
      failed++;
      console.error(`\n  Failed ${dateStr}: ${err?.message}`);
    }
  }

  console.log(`\n\nDone. ${success} upserted, ${failed} failed.`);

  const lastLine = lines[lines.length - 1];
  const latestClose = parseFloat(lastLine.split(",")[1]);
  const latestDate  = lastLine.split(",")[0];
  await db.asset.update({ where: { id: soxx.id }, data: { closePrice: latestClose } });
  console.log(`Live closePrice updated to $${latestClose} (${latestDate}).`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
