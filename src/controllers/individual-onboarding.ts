// src/controllers/individual-onboarding.ts
import { Request, Response } from "express";
import { db } from "@/db/db";
import { BeneficiaryRelation, Prisma } from "@prisma/client";

function getUserId(req: Request): string | undefined {
  return (req as any)?.user?.userId;
}

function parseDate(d?: string | null): Date | null {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x;
}

function requireFields(obj: Record<string, any>, fields: string[]) {
  return fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === "");
}

function parseBeneficiaryRelation(v?: string): BeneficiaryRelation {
  const map: Record<string, BeneficiaryRelation> = {
    SPOUSE: "SPOUSE",
    CHILD: "CHILD",
    PARENT: "PARENT",
    SIBLING: "SIBLING",
    OTHER: "OTHER",
  };
  return map[String(v || "").toUpperCase()] ?? "OTHER";
}

// ---------------------------------------------------------------------------
// POST /onboarding/individual
// Creates or updates an IndividualOnboarding record for the authenticated user.
// Body shape:
// {
//   fullName, dateOfBirth, tin?, homeAddress, email, phoneNumber,
//   employmentStatus, occupation, companyName?, hasBusiness?,
//   primaryGoal, timeHorizon, riskTolerance, investmentExperience,
//   sourceOfIncome, employmentIncome, expectedInvestment, businessOwnership?,
//   isPEP, publicPosition?, relationshipToCountry?, familyMemberDetails?,
//   sanctionsOrLegal, consentToDataCollection, agreeToTerms,
//   nationalIdUrl (required), passportPhotoUrl?, tinCertificateUrl?,
//   bankStatementUrl?,
//   agentId?,
//   beneficiaries: [
//     { fullName, dateOfBirth?, phone, address?, relation?, tin?, documentUrl? }
//     // at least 1 required
//   ],
//   nextOfKin: [
//     { fullName, dateOfBirth?, phone, address?, relation?, tin?, documentUrl? }
//     // at least 1 required
//   ]
// }
// ---------------------------------------------------------------------------
export async function submitIndividualOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const payload = req.body as any;

    // --- Basic required fields ---
    const missing = requireFields(payload, [
      "fullName",
      "dateOfBirth",
      "homeAddress",
      "email",
      "phoneNumber",
      "employmentStatus",
      "occupation",
      "primaryGoal",
      "timeHorizon",
      "riskTolerance",
      "investmentExperience",
      "sourceOfIncome",
      "employmentIncome",
      "expectedInvestment",
    ]);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    // --- Sanctions / legal check ---
    const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim().toLowerCase();
    if (sanctionsOrLegal === "yes") {
      return res.status(400).json({ error: "Cannot open account due to sanctions/legal history." });
    }

    // --- Required document ---
    if (!payload.nationalIdUrl) {
      return res.status(400).json({ error: "National ID / Passport upload is required." });
    }

    // --- TIN validation (optional field, but must be 10 digits if provided) ---
    if (payload.tin) {
      if (!/^\d{10}$/.test(String(payload.tin))) {
        return res.status(400).json({ error: "TIN must be exactly 10 digits." });
      }
      const conflict = await db.individualOnboarding.findFirst({
        where: { tin: String(payload.tin), NOT: { userId } },
        select: { id: true },
      });
      if (conflict) return res.status(409).json({ error: "TIN is already in use." });
    }

    // --- Beneficiaries validation (at least 1) ---
    const rawBeneficiaries: any[] = Array.isArray(payload.beneficiaries) ? payload.beneficiaries : [];
    if (rawBeneficiaries.length === 0) {
      return res.status(400).json({ error: "At least one beneficiary is required." });
    }
    for (let i = 0; i < rawBeneficiaries.length; i++) {
      const b = rawBeneficiaries[i];
      const bMissing = requireFields(b, ["fullName", "phone"]);
      if (bMissing.length) {
        return res.status(400).json({ error: `Beneficiary #${i + 1} missing: ${bMissing.join(", ")}` });
      }
    }

    // --- Next of Kin validation (at least 1) ---
    const rawNextOfKin: any[] = Array.isArray(payload.nextOfKin) ? payload.nextOfKin : [];
    if (rawNextOfKin.length === 0) {
      return res.status(400).json({ error: "At least one next of kin is required." });
    }
    for (let i = 0; i < rawNextOfKin.length; i++) {
      const n = rawNextOfKin[i];
      const nMissing = requireFields(n, ["fullName", "phone"]);
      if (nMissing.length) {
        return res.status(400).json({ error: `Next of kin #${i + 1} missing: ${nMissing.join(", ")}` });
      }
    }

    // --- Upsert IndividualOnboarding ---
    const onboardingData: Prisma.IndividualOnboardingUncheckedCreateInput = {
      userId,
      agentId: payload.agentId ?? null,

      fullName: String(payload.fullName),
      dateOfBirth: parseDate(payload.dateOfBirth) ?? undefined,
      tin: payload.tin ? String(payload.tin).trim() : null,
      avatarUrl: payload.avatarUrl ?? null,
      homeAddress: String(payload.homeAddress),
      email: String(payload.email),
      phoneNumber: String(payload.phoneNumber),
      employmentStatus: String(payload.employmentStatus),
      occupation: String(payload.occupation),
      companyName: payload.companyName ?? null,
      hasBusiness: payload.hasBusiness ?? null,

      primaryGoal: String(payload.primaryGoal),
      timeHorizon: String(payload.timeHorizon),
      riskTolerance: String(payload.riskTolerance),
      investmentExperience: String(payload.investmentExperience),
      sourceOfIncome: String(payload.sourceOfIncome),
      employmentIncome: String(payload.employmentIncome),
      expectedInvestment: String(payload.expectedInvestment),
      businessOwnership: payload.businessOwnership ?? null,

      isPEP: payload.isPEP ? String(payload.isPEP) : null,
      publicPosition: payload.publicPosition ?? null,
      relationshipToCountry: payload.relationshipToCountry ?? null,
      familyMemberDetails: payload.familyMemberDetails ?? null,

      sanctionsOrLegal: sanctionsOrLegal || null,
      consentToDataCollection: !!payload.consentToDataCollection,
      agreeToTerms: !!payload.agreeToTerms,

      nationalIdUrl: String(payload.nationalIdUrl),
      passportPhotoUrl: payload.passportPhotoUrl ?? null,
      tinCertificateUrl: payload.tinCertificateUrl ?? null,
      bankStatementUrl: payload.bankStatementUrl ?? null,

      isApproved: false,
    };

    const saved = await db.$transaction(async (tx) => {
      // Upsert the main record
      const record = await tx.individualOnboarding.upsert({
        where: { userId },
        update: onboardingData,
        create: onboardingData,
      });

      // Replace beneficiaries
      await tx.beneficiary.deleteMany({ where: { individualOnboardingId: record.id } });
      if (rawBeneficiaries.length > 0) {
        await tx.beneficiary.createMany({
          data: rawBeneficiaries.map((b) => ({
            individualOnboardingId: record.id,
            fullName: String(b.fullName),
            dateOfBirth: parseDate(b.dateOfBirth) ?? undefined,
            phone: String(b.phone),
            address: b.address ? String(b.address) : null,
            relation: parseBeneficiaryRelation(b.relation),
            tin: b.tin ? String(b.tin).trim() : null,
            documentUrl: b.documentUrl ?? null,
          })),
        });
      }

      // Replace next of kin
      await tx.nextOfKin.deleteMany({ where: { individualOnboardingId: record.id } });
      if (rawNextOfKin.length > 0) {
        await tx.nextOfKin.createMany({
          data: rawNextOfKin.map((n) => ({
            individualOnboardingId: record.id,
            fullName: String(n.fullName),
            dateOfBirth: parseDate(n.dateOfBirth) ?? undefined,
            phone: String(n.phone),
            address: n.address ? String(n.address) : null,
            relation: parseBeneficiaryRelation(n.relation),
            tin: n.tin ? String(n.tin).trim() : null,
            documentUrl: n.documentUrl ?? null,
          })),
        });
      }

      // Return with relations
      return tx.individualOnboarding.findUnique({
        where: { id: record.id },
        include: { beneficiaries: true, nextOfKin: true, agent: { select: { id: true, position: true, user: { select: { name: true, email: true } } } } },
      });
    });

    return res.status(200).json({ ok: true, data: saved });
  } catch (e) {
    console.error("submitIndividualOnboarding error:", e);
    return res.status(500).json({ error: "Failed to submit individual onboarding." });
  }
}

// ---------------------------------------------------------------------------
// GET /onboarding/individual/me
// Returns the caller's IndividualOnboarding record (with beneficiaries & next of kin).
// ---------------------------------------------------------------------------
export async function getMyIndividualOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const record = await db.individualOnboarding.findUnique({
      where: { userId },
      include: {
        beneficiaries: true,
        nextOfKin: true,
        agent: {
          select: {
            id: true,
            position: true,
            user: { select: { name: true, email: true, imageUrl: true } },
          },
        },
      },
    });

    return res.status(200).json({ ok: true, data: record || null });
  } catch (e) {
    console.error("getMyIndividualOnboarding error:", e);
    return res.status(500).json({ error: "Failed to load individual onboarding." });
  }
}

// ---------------------------------------------------------------------------
// POST /onboarding/validate-tin
// Body: { tin: string; userId?: string }
// Checks across BOTH individual and company onboarding tables.
// ---------------------------------------------------------------------------
export async function validateTin(req: Request, res: Response) {
  try {
    const { tin, userId: bodyUserId } = req.body as { tin?: string; userId?: string };
    const callerId = getUserId(req) || bodyUserId;

    if (!tin) return res.status(400).json({ error: "tin is required." });
    if (!/^\d{10}$/.test(String(tin))) {
      return res.status(400).json({ error: "TIN must be exactly 10 digits." });
    }

    const [indConflict, coConflict] = await Promise.all([
      db.individualOnboarding.findFirst({
        where: { tin: String(tin), NOT: callerId ? { userId: callerId } : undefined },
        select: { id: true },
      }),
      db.companyOnboarding.findFirst({
        where: { tin: String(tin), NOT: callerId ? { userId: callerId } : undefined },
        select: { id: true },
      }),
    ]);

    return res.status(200).json({ ok: true, isUnique: !indConflict && !coConflict });
  } catch (e) {
    console.error("validateTin error:", e);
    return res.status(500).json({ error: "Failed to validate TIN." });
  }
}

// ---------------------------------------------------------------------------
// PATCH /onboarding/individual/:id/approve
// Sets isApproved = true on the IndividualOnboarding record.
// ---------------------------------------------------------------------------
export async function approveIndividualOnboarding(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const record = await db.individualOnboarding.findUnique({ where: { id }, select: { id: true } });
    if (!record) return res.status(404).json({ error: "Individual onboarding record not found." });

    const updated = await db.individualOnboarding.update({
      where: { id },
      data: { isApproved: true },
      select: { id: true, userId: true, isApproved: true, updatedAt: true },
    });

    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error("approveIndividualOnboarding error:", e);
    return res.status(500).json({ error: "Failed to approve onboarding." });
  }
}