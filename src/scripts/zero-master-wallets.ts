/**
 * src/scripts/zero-master-wallets.ts
 * Zeros all financial fields on the master wallets for the listed clients.
 * Run: npx tsx src/scripts/zero-master-wallets.ts
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Each entry is [part1, part2] — the script tries both firstName/lastName orderings.
// For single-word entries, part2 is null and we search either field.
const TARGET_NAMES: [string, string | null][] = [
  ["james",    "musazi"],
  ["jenifer",  "byokusheka"],
  ["joanita",  "nanyonjo"],
  ["mugambwa", "lawrence"],
  ["olupo",    "ajeni"],
  ["vicent",   "mutahunga"],
  ["oyet",     null],          // "to oyet" — search by either field
  ["nanteza",  "rebecca"],
];

async function findUsers(part1: string, part2: string | null) {
  if (!part2) {
    return db.user.findMany({
      where: {
        OR: [
          { firstName: { contains: part1, mode: "insensitive" } },
          { lastName:  { contains: part1, mode: "insensitive" } },
        ],
      },
      include: { masterWallet: true },
    });
  }

  return db.user.findMany({
    where: {
      OR: [
        // normal order
        {
          firstName: { contains: part1, mode: "insensitive" },
          lastName:  { contains: part2, mode: "insensitive" },
        },
        // reversed order
        {
          firstName: { contains: part2, mode: "insensitive" },
          lastName:  { contains: part1, mode: "insensitive" },
        },
      ],
    },
    include: { masterWallet: true },
  });
}

async function main() {
  console.log("=".repeat(60));
  console.log("  ZERO MASTER WALLETS — DRY RUN FIRST");
  console.log("=".repeat(60));

  const toZero: { userId: string; walletId: string; name: string; email: string; balance: number }[] = [];

  for (const [part1, part2] of TARGET_NAMES) {
    const label = part2 ? `${part1} ${part2}` : part1;
    const users = await findUsers(part1, part2);

    if (users.length === 0) {
      console.log(`\n[NOT FOUND] "${label}"`);
      continue;
    }

    for (const u of users) {
      const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      const wallet   = u.masterWallet;

      if (!wallet) {
        console.log(`\n[NO WALLET] ${fullName} (${u.email}) — no master wallet row`);
        continue;
      }

      console.log(`\n[FOUND] ${fullName} (${u.email})`);
      console.log(`        Wallet: ${wallet.accountNumber}`);
      console.log(`        balance=$${wallet.balance}  deposited=$${wallet.totalDeposited}  withdrawn=$${wallet.totalWithdrawn}  fees=$${wallet.totalFees}  NAV=$${wallet.netAssetValue}`);

      toZero.push({
        userId:   u.id,
        walletId: wallet.id,
        name:     fullName,
        email:    u.email,
        balance:  wallet.balance,
      });
    }
  }

  if (toZero.length === 0) {
    console.log("\nNothing to zero. Exiting.");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  Will zero ${toZero.length} master wallet(s):`);
  toZero.forEach((r) => console.log(`    • ${r.name} (${r.email})  current balance: $${r.balance}`));
  console.log("=".repeat(60));

  // Apply
  let success = 0;
  let failed  = 0;

  for (const r of toZero) {
    try {
      await db.masterWallet.update({
        where: { id: r.walletId },
        data: {
          balance:        0,
          totalDeposited: 0,
          totalWithdrawn: 0,
          totalFees:      0,
          netAssetValue:  0,
        },
      });
      console.log(`  ✓ Zeroed: ${r.name}`);
      success++;
    } catch (err) {
      console.error(`  ✗ Failed: ${r.name} —`, err);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  Done. ${success} zeroed, ${failed} failed.`);
  console.log("=".repeat(60));
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
