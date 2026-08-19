import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const db = new PrismaClient();
const CSV_PATH = "C:/Users/user/AppData/Local/Temp/pltr_history.csv";

async function main() {
  let asset = await db.asset.findFirst({ where: { symbol: "PLTR" } });
  if (!asset) asset = await db.asset.findFirst({ where: { description: { contains: "Palantir", mode: "insensitive" } } });
  if (!asset) {
    const all = await db.asset.findMany({ select: { id: true, symbol: true, description: true } });
    console.log("All assets:", JSON.stringify(all, null, 2));
    console.error("Palantir asset not found.");
    process.exit(1);
  }
  console.log(`Found asset — symbol: ${asset.symbol}, id: ${asset.id}`);

  const lines = fs.readFileSync(CSV_PATH, "utf-8")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && /^\d{4}-\d{2}-\d{2},/.test(l));

  console.log(`Upserting ${lines.length} price records (Jan 2023 – Sep 2025)...`);

  let success = 0;
  let failed  = 0;

  for (const line of lines) {
    const [dateStr, priceStr] = line.split(",");
    const closePrice = parseFloat(priceStr);
    const priceDate  = new Date(dateStr + "T00:00:00.000Z");
    try {
      await db.assetPriceHistory.upsert({
        where:  { assetId_priceDate: { assetId: asset.id, priceDate } },
        update: { closePrice },
        create: { assetId: asset.id, priceDate, closePrice },
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
  await db.asset.update({ where: { id: asset.id }, data: { closePrice: latestClose } });
  console.log(`Live closePrice updated to $${latestClose} (${latestDate}).`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
