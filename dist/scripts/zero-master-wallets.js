"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const db = new client_1.PrismaClient();
const TARGET_NAMES = [
    ["james", "musazi"],
    ["jenifer", "byokusheka"],
    ["joanita", "nanyonjo"],
    ["mugambwa", "lawrence"],
    ["olupo", "ajeni"],
    ["vicent", "mutahunga"],
    ["oyet", null],
    ["nanteza", "rebecca"],
];
function findUsers(part1, part2) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!part2) {
            return db.user.findMany({
                where: {
                    OR: [
                        { firstName: { contains: part1, mode: "insensitive" } },
                        { lastName: { contains: part1, mode: "insensitive" } },
                    ],
                },
                include: { masterWallet: true },
            });
        }
        return db.user.findMany({
            where: {
                OR: [
                    {
                        firstName: { contains: part1, mode: "insensitive" },
                        lastName: { contains: part2, mode: "insensitive" },
                    },
                    {
                        firstName: { contains: part2, mode: "insensitive" },
                        lastName: { contains: part1, mode: "insensitive" },
                    },
                ],
            },
            include: { masterWallet: true },
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log("=".repeat(60));
        console.log("  ZERO MASTER WALLETS — DRY RUN FIRST");
        console.log("=".repeat(60));
        const toZero = [];
        for (const [part1, part2] of TARGET_NAMES) {
            const label = part2 ? `${part1} ${part2}` : part1;
            const users = yield findUsers(part1, part2);
            if (users.length === 0) {
                console.log(`\n[NOT FOUND] "${label}"`);
                continue;
            }
            for (const u of users) {
                const fullName = `${(_a = u.firstName) !== null && _a !== void 0 ? _a : ""} ${(_b = u.lastName) !== null && _b !== void 0 ? _b : ""}`.trim();
                const wallet = u.masterWallet;
                if (!wallet) {
                    console.log(`\n[NO WALLET] ${fullName} (${u.email}) — no master wallet row`);
                    continue;
                }
                console.log(`\n[FOUND] ${fullName} (${u.email})`);
                console.log(`        Wallet: ${wallet.accountNumber}`);
                console.log(`        balance=$${wallet.balance}  deposited=$${wallet.totalDeposited}  withdrawn=$${wallet.totalWithdrawn}  fees=$${wallet.totalFees}  NAV=$${wallet.netAssetValue}`);
                toZero.push({
                    userId: u.id,
                    walletId: wallet.id,
                    name: fullName,
                    email: u.email,
                    balance: wallet.balance,
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
        let success = 0;
        let failed = 0;
        for (const r of toZero) {
            try {
                yield db.masterWallet.update({
                    where: { id: r.walletId },
                    data: {
                        balance: 0,
                        totalDeposited: 0,
                        totalWithdrawn: 0,
                        totalFees: 0,
                        netAssetValue: 0,
                    },
                });
                console.log(`  ✓ Zeroed: ${r.name}`);
                success++;
            }
            catch (err) {
                console.error(`  ✗ Failed: ${r.name} —`, err);
                failed++;
            }
        }
        console.log("\n" + "=".repeat(60));
        console.log(`  Done. ${success} zeroed, ${failed} failed.`);
        console.log("=".repeat(60));
    });
}
main()
    .catch(console.error)
    .finally(() => db.$disconnect());
