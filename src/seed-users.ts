// src/seed-users.ts
// Run with: npx ts-node src/seed-users.ts
require("dotenv").config();
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const users = [
  { firstName: "RICHARD", lastName: "BASALIRWA", phone: "+256772629079", email: "rjbbnew@gmail.com" },
  { firstName: "JOANITA", lastName: "NANYONJO", phone: "+256773474347", email: "joannekato@gmail.com" },
  { firstName: "Carolyne Kymberley", lastName: "Agoe", phone: "+256788250077", email: "agoe.carol@gmail.com" },
  { firstName: "Geoffrey", lastName: "Barungi Kyondo", phone: "+256752956062", email: "gkyondo@gmail.com" },
  { firstName: "Irene", lastName: "Nakachwa", phone: "+256772844698", email: "inakachwa79@gmail.com" },
  { firstName: "Annet", lastName: "Busulwa Sango", phone: "+256772523343", email: "sango@gmail.com" },
  { firstName: "Anthony", lastName: "Anyuru Obura", phone: "+256759186385", email: "aaobura@gmail.com" },
  { firstName: "Gideon", lastName: "Ndawula", phone: "+256752784072", email: "ndawulagideon@gmail.com" },
  { firstName: "Joshua", lastName: "Mugala", phone: "+256779565154", email: "jomugala@gmail.com" },
  { firstName: "Godfrey", lastName: "Atatwebwa", phone: "+256772121553", email: "atatweg@gmail.com" },
  { firstName: "Esther", lastName: "Birungi", phone: "+256782025254", email: "birungisthr@yahoo.com" },
  { firstName: "Davis", lastName: "Mugisa Musiime", phone: "+256783392052", email: "musiimemda@gmail.com" },
  { firstName: "Douglas", lastName: "Kavuma", phone: "+256785318441", email: "kavumadouglas.jk@gmail.com" },
  { firstName: "Hanning", lastName: "Karani", phone: "+256772485706", email: "karahn24@yahoo.co.uk" },
  { firstName: "John Mary", lastName: "Mzee Kisembo", phone: "+256753750454", email: "kisembo1@gmail.com" },
  { firstName: "Jude", lastName: "Okongo", phone: "+256701343109", email: "judeokongo@gmail.com" },
  { firstName: "Annie", lastName: "Komurembe Bandonda", phone: "+256772368121", email: "komurembeanne@gmail.com" },
  { firstName: "Modest", lastName: "Rutagengwa", phone: "+256772634848", email: "modestruta@yahoo.com" },
  { firstName: "Ndibarema", lastName: "Dadinoh", phone: "+256705854857", email: "dadinoh1@gmail.com" },
  { firstName: "Tom", lastName: "Oyet", phone: "+256772314864", email: "larryoyet@gmail.com" },
  { firstName: "Valence Buherere", lastName: "Arineitwe", phone: "+256702194705", email: "alivalence@gmail.com" },
  { firstName: "Nansubuga", lastName: "Hanifa", phone: "+256702590351", email: "nansubugahanifa6@gmail.com" },
  { firstName: "Jennifer", lastName: "Byokusheka", phone: "+256772469106", email: "jennyb@consultant.com" },
  { firstName: "Juliet Tusiime", lastName: "Sabiiti", phone: "+256772607311", email: "tjuliets@yahoo.com" },
  { firstName: "Lucy", lastName: "Ociti", phone: "+256753471034", email: "lucyociti@gmail.com" },
  { firstName: "Aidan", lastName: "Birungi", phone: "+256783179150", email: "birungiaidan@gmail.com" },
  { firstName: "Geoffrey", lastName: "Kwebiiha", phone: "+256701349936", email: "dekwebs@gmail.com" },
  { firstName: "Phionah", lastName: "Mwesige", phone: "+256789702576", email: "phionahml@gmail.com" },
  { firstName: "Derrick", lastName: "Rukundo", phone: "+256784130400", email: "derls.rukundo@gmail.com" },
  { firstName: "Sylvia", lastName: "Atuhaire", phone: "+256772351340", email: "sylviaatuhaire4@gmail.com" },
  { firstName: "Yosamu", lastName: "Barekye", phone: "+256772822266", email: "barekyey40@gmail.com" },
  { firstName: "Faith", lastName: "Atuhurira", phone: "+256752711804", email: "faith.angelica@gmail.com" },
  { firstName: "Timothy", lastName: "Tigaikara", phone: "+256772798175", email: "timotigs@yahoo.com" },
  { firstName: "George Keneth", lastName: "Akena", phone: "+256701837051", email: "gaken29@gmail.com" },
  { firstName: "Emmanuel", lastName: "Engoru", phone: "+256781620079", email: "eengoru@gmail.com" },
  { firstName: "Mary Jean", lastName: "Akello", phone: "+256778110947", email: "majeak4@gmail.com" },
  { firstName: "Stella Marie", lastName: "Abwalo", phone: "+256789751569", email: "steabo4@gmail.com" },
  { firstName: "Catherine", lastName: "Kakayi", phone: "+25676477992", email: "catherinekakayi63@gmail.com" },
  { firstName: "Boaz", lastName: "Chemonges", phone: "+256768485816", email: "chemongesboaz@gmail.com" },
  { firstName: "Godfrey", lastName: "Wangalwa", phone: "+256763890309", email: "wangalwagodfrey@gmail.com" },
  { firstName: "Isaac", lastName: "Khisa", phone: "+256786752115", email: "khisaisaac123@gmail.com" },
  { firstName: "Mosee", lastName: "Kisaka", phone: "+256788064500", email: "kisakamoses2@gmail.com" },
  { firstName: "Simon", lastName: "Wakwaale", phone: "+256777940086", email: "simonwakwaale@gmail.com" },
  { firstName: "Musiimenta", lastName: "Gloria", phone: "+256701858707", email: "wendygloria57@gmail.com" },
  { firstName: "Ivan", lastName: "Sengendo", phone: "+256702373110", email: "isengendo@gmail.com" },
  { firstName: "James", lastName: "Musaazi", phone: "+256782630991", email: "jssenge@gmail.com" },
  { firstName: "Jimmy", lastName: "Mokili", phone: "+256776831560", email: "mokilijimmy1@gmail.com" },
  { firstName: "Lawrence", lastName: "Mugambwa", phone: "+256750035895", email: "mugambwalawrence6@gmail.com" },
  { firstName: "Monica", lastName: "Kalemba", phone: "+256772507100", email: "mckalemba@yahoo.co.uk" },
  { firstName: "Rebecca", lastName: "Nanteza", phone: "+25612345678", email: "kigozibekah@gmail.com" },
  { firstName: "Ssebwalunyo Julius Justus", lastName: "Walusimbi", phone: "+256772861203", email: "jsebwalace@yahoo.co.uk" },
  { firstName: "Danstan", lastName: "Kisuule", phone: "+256753533177", email: "dkisuule@y-save.org" },
  { firstName: "Vincent", lastName: "mutahunga", phone: "+256782821821", email: "mutahunga01@gmail.com" },
  { firstName: "Perles Medicales Ltd", lastName: "Perles Medicales Ltd", phone: "+256702740913", email: "perlesmedicalesltd@gmail.com" },
  { firstName: "Stella", lastName: "Mukabalisa", phone: "+256785141259", email: "smukabalisa@gmail.com" },
  { firstName: "Miriam", lastName: "Abalo", phone: "+256759080933", email: "abalo933miriam@gmail.com" },
  { firstName: "Fauza", lastName: "namukuve", phone: "+256782572362", email: "nfauzia2001@yahoo.co.uk" },
  { firstName: "Issa", lastName: "Katwesige", phone: "+256782432048", email: "issakatwesige@gmail.com" },
  { firstName: "Fred Wakwale", lastName: "Bwayo", phone: "+256783362680", email: "simonwakwale7@gmail.com" },
  { firstName: "Simon", lastName: "Wakwaale", phone: "+256759080896", email: "ststephencompss@gmail.com" },
  { firstName: "Regina", lastName: "Nazziwa", phone: "+256779184713", email: "rnazziwa1@gmail.com" },
  { firstName: "Esther", lastName: "Kaitesi Ndooli", phone: "+256702654285", email: "ekkenhan44@gmail.com" },
  { firstName: "Emmanuel ALF", lastName: "Matsiko", phone: "+256752600113", email: "bebz4emma@gmail.com" },
  { firstName: "Robert", lastName: "Migadde Ndugwa", phone: "+256776222034", email: "robmig1980@gmail.com" },
  { firstName: "Ashaba", lastName: "Jeremiah Ahebwa", phone: "+256788920472", email: "ashabajeremiah7@gmail.com" },
  { firstName: "Lillian Nsiima", lastName: "Namugaya", phone: "+256775957349", email: "namugaya@gmail.com" },
  { firstName: "Jonathan", lastName: "Abaho", phone: "+256785606777", email: "jonathan.abaho95@gmail.com" },
  { firstName: "George Lawrence", lastName: "Opio", phone: "+256773428076", email: "lawgeorgeo@gmail.com" },
  { firstName: "NGOBI", lastName: "OWEN ALBERT", phone: "+25670645342455", email: "ngowen66@gmail.com" },
  { firstName: "Julian Annet", lastName: "Kaganzi", phone: "+256772591751", email: "kaganzi@hotmail.com" },
  { firstName: "Fiona", lastName: "Onya", phone: "+256787887024", email: "onyafiona@gmail.com" },
  { firstName: "Stephen", lastName: "Akabway", phone: "+25670686221", email: "akabwaystephen2016@gmail.com" },
  { firstName: "CATHERINE", lastName: "NABUWUFU", phone: "+2560783871890", email: "mwesigwacatherine62@gmail.com" },
  { firstName: "Stephen", lastName: "Olupot Ajeni", phone: "+256776358306", email: "ajenistephen@gmail.com" },
  { firstName: "Ariho", lastName: "Alvin", phone: "+256+256786548881", email: "arihoal@gmail.com" },
  { firstName: "SHACK 1995-2000", lastName: "INVESTMENT CLUB", phone: "+256776600113", email: "buyondo2@gmail.com" },
  { firstName: "KARIMBA PETER", lastName: "MUHUMUZA", phone: "+256751211866", email: "karimbapetermuhumuza@gmail.com" },
  { firstName: "PETER", lastName: "KATO", phone: "+256701132736", email: "peterskats@gmail.com" },
  { firstName: "ORIBOKIRIHO", lastName: "Bright", phone: "+256772565600", email: "dtmbarara56@gmail.com" },
  { firstName: "Jim", lastName: "Patrick", phone: "+256763483177", email: "jimpatrickwasswa@gmail.com" },
  { firstName: "JOSHUA SIKHU", lastName: "OKONYA", phone: "+256774447593", email: "joshua.okonya@gmail.com" },
];

function generateAccountNumber(): string {
  const min = 1_000_000;
  const max = 10_000_000;
  return `GK${Math.floor(Math.random() * (max - min) + min)}`;
}

async function seed() {
  console.log("Starting user seed...\n");

  const defaultPassword = await bcrypt.hash("Goldkach@2024", 12);

  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      // Check if user already exists
      const existing = await db.user.findFirst({
        where: {
          OR: [
            { email: user.email.toLowerCase() },
            { phone: user.phone },
          ],
        },
      });

      if (existing) {
        console.log(`⏭️  Skipped: ${user.email} (already exists)`);
        skippedCount++;
        continue;
      }

      // Create user with master wallet
      const accountNumber = generateAccountNumber();
      
      await db.user.create({
        data: {
          email: user.email.toLowerCase(),
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName || "",
          name: user.lastName 
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.firstName,
          password: defaultPassword,
          emailVerified: false,
          role: "USER",
          status: "PENDING",
          isApproved: false,
          masterWallet: {
            create: {
              accountNumber,
              balance: 0,
              totalDeposited: 0,
              totalWithdrawn: 0,
              totalFees: 0,
              netAssetValue: 0,
              status: "ACTIVE",
            },
          },
        },
      });

      console.log(`✅ Created: ${user.email}`);
      successCount++;
    } catch (error) {
      console.log(`❌ Error: ${user.email} - ${error}`);
      errorCount++;
    }
  }

  console.log("\n========================================");
  console.log("Seed completed!");
  console.log(`✅ Created: ${successCount}`);
  console.log(`⏭️  Skipped: ${skippedCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log("========================================");

  await db.$disconnect();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
