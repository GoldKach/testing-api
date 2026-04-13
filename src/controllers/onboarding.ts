// src/controllers/onboarding.ts
import { Request, Response } from "express";
import { db } from "@/db/db";
import { BeneficiaryRelation, CompanyType, OwnershipType, Prisma } from "@prisma/client";

/* ─────────────────────────────────────────
   Helpers
───────────────────────────────────────── */

function getUserId(req: Request): string | undefined {
  return (
    (req as any)?.user?.id ||
    (req.body?.userId as string) ||
    (req.query?.userId as string)
  );
}

function parseDate(d?: string | null): Date | null {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x;
}

function requireFields(obj: Record<string, any>, fields: string[]) {
  return fields.filter(
    (f) => obj[f] === undefined || obj[f] === null || obj[f] === ""
  );
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

function parseCompanyType(v?: string): CompanyType {
  const map: Record<string, CompanyType> = {
    LIMITED: "LIMITED",
    PARTNERSHIP: "PARTNERSHIP",
    NGO: "NGO",
    COOPERATIVE: "COOPERATIVE",
    SAVINGS_GROUP: "SAVINGS_GROUP",
    MICROFINANCE: "MICROFINANCE",
  };
  return map[String(v || "").toUpperCase().replace(/\s+/g, "_")] ?? "LIMITED";
}

function parseOwnershipType(v?: string): OwnershipType {
  const map: Record<string, OwnershipType> = {
    OWNERSHIP_BY_SENIOR: "OWNERSHIP_BY_SENIOR",
    MANAGEMENT_OFFICIAL: "MANAGEMENT_OFFICIAL",
    OTHER: "OTHER",
  };
  return map[String(v || "").toUpperCase().replace(/\s+/g, "_")] ?? "OTHER";
}

/* ═══════════════════════════════════════════
   INDIVIDUAL ONBOARDING
   POST /onboarding/individual
═══════════════════════════════════════════ */
export async function submitIndividualOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const payload = req.body as any;

    // Validate agentId — null it out if it doesn't exist in StaffProfile
    let resolvedAgentId: string | null = payload.agentId ?? null;
    if (resolvedAgentId) {
      const agentExists = await db.staffProfile.findUnique({
        where: { id: resolvedAgentId },
        select: { id: true },
      });
      if (!agentExists) resolvedAgentId = null;
    }

    // Required fields
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
      return res
        .status(400)
        .json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    // Sanctions check
    const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim().toLowerCase();
    if (sanctionsOrLegal === "yes") {
      return res
        .status(400)
        .json({ error: "Cannot open account due to sanctions/legal history." });
    }

    // Required document
    if (!payload.nationalIdUrl) {
      return res
        .status(400)
        .json({ error: "National ID / Passport upload is required." });
    }

    // TIN — optional but validated if provided
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

    // Beneficiaries — at least 1
    const rawBeneficiaries: any[] = Array.isArray(payload.beneficiaries)
      ? payload.beneficiaries
      : [];
    if (rawBeneficiaries.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one beneficiary is required." });
    }
    for (let i = 0; i < rawBeneficiaries.length; i++) {
      const b = rawBeneficiaries[i];
      if (!b.fullName || !b.phone) {
        return res
          .status(400)
          .json({ error: `Beneficiary #${i + 1}: fullName and phone are required.` });
      }
    }

    // Next of Kin — at least 1
    const rawNextOfKin: any[] = Array.isArray(payload.nextOfKin)
      ? payload.nextOfKin
      : [];
    if (rawNextOfKin.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one next of kin is required." });
    }
    for (let i = 0; i < rawNextOfKin.length; i++) {
      const n = rawNextOfKin[i];
      if (!n.fullName || !n.phone) {
        return res
          .status(400)
          .json({ error: `Next of kin #${i + 1}: fullName and phone are required.` });
      }
    }

    // Upsert in a transaction
    const onboardingData: Prisma.IndividualOnboardingUncheckedCreateInput = {
      userId,
      agentId: resolvedAgentId,
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
      const record = await tx.individualOnboarding.upsert({
        where: { userId },
        update: onboardingData,
        create: onboardingData,
      });

      // Replace beneficiaries
      await tx.beneficiary.deleteMany({ where: { individualOnboardingId: record.id } });
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

      // Replace next of kin
      await tx.nextOfKin.deleteMany({ where: { individualOnboardingId: record.id } });
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

      return tx.individualOnboarding.findUnique({
        where: { id: record.id },
        include: {
          beneficiaries: true,
          nextOfKin: true,
          agent: {
            select: {
              id: true,
              position: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      });
    });

    return res.status(200).json({ ok: true, data: saved });
  } catch (e: any) {
    console.error("submitIndividualOnboarding error:", e);
    // Handle Prisma unique constraint violations
    if (e?.code === "P2002") {
      const field = (e?.meta?.target as string[] | undefined)?.[0] ?? "field";
      return res.status(409).json({ error: `${field === "tin" ? "TIN" : field} is already in use by another account.` });
    }
    const errMsg = e?.response?.data?.error || e?.message || e?.meta?.cause || "Failed to submit individual onboarding.";
    return res.status(500).json({ error: errMsg });
  }
}

/* ─────────────────────────────────────────
   GET /onboarding/individual/me
───────────────────────────────────────── */
export async function getMyIndividualOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ error: "Not authenticated (userId missing)." });

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

/* ═══════════════════════════════════════════
   COMPANY ONBOARDING
   POST /onboarding/company
═══════════════════════════════════════════ */
export async function submitCompanyOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const payload = req.body as any;

    // Required fields
    const missing = requireFields(payload, ["companyName", "email", "companyType"]);
    if (missing.length) {
      return res
        .status(400)
        .json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    // Phone numbers
    const phoneNumbers: string[] = Array.isArray(payload.phoneNumbers)
      ? payload.phoneNumbers.map(String).filter(Boolean)
      : [];
    if (phoneNumbers.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one official phone number is required." });
    }

    // Sanctions check
    const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim().toLowerCase();
    if (sanctionsOrLegal === "yes") {
      return res
        .status(400)
        .json({ error: "Cannot open account due to sanctions/legal history." });
    }

    // Required document
    if (!payload.bankStatementUrl) {
      return res.status(400).json({ error: "Bank statement upload is required." });
    }

    // SACCO / savings group requires constitution
    const companyType = parseCompanyType(payload.companyType);
    if (
      (companyType === "SAVINGS_GROUP" || companyType === "MICROFINANCE") &&
      !payload.constitutionUrl
    ) {
      return res.status(400).json({
        error:
          "Constitution document is required for SACCOs / savings groups / microfinance.",
      });
    }

    // TIN uniqueness
    if (payload.tin) {
      if (!/^\d{10}$/.test(String(payload.tin))) {
        return res.status(400).json({ error: "TIN must be exactly 10 digits." });
      }
      const [indConflict, coConflict] = await Promise.all([
        db.individualOnboarding.findFirst({
          where: { tin: String(payload.tin), NOT: { userId } },
          select: { id: true },
        }),
        db.companyOnboarding.findFirst({
          where: { tin: String(payload.tin), NOT: { userId } },
          select: { id: true },
        }),
      ]);
      if (indConflict || coConflict) {
        return res.status(409).json({ error: "TIN is already in use." });
      }
    }

    // Registration number uniqueness
    if (payload.registrationNumber) {
      const regConflict = await db.companyOnboarding.findFirst({
        where: {
          registrationNumber: String(payload.registrationNumber),
          NOT: { userId },
        },
        select: { id: true },
      });
      if (regConflict) {
        return res.status(409).json({ error: "Registration number is already in use." });
      }
    }

    // Directors — at least 1
    const rawDirectors: any[] = Array.isArray(payload.directors)
      ? payload.directors
      : [];
    if (rawDirectors.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one company director is required." });
    }
    for (let i = 0; i < rawDirectors.length; i++) {
      if (!rawDirectors[i].fullName?.trim()) {
        return res
          .status(400)
          .json({ error: `Director #${i + 1}: fullName is required.` });
      }
    }

    // UBOs — optional but validated if provided
    const rawUBOs: any[] = Array.isArray(payload.ubos) ? payload.ubos : [];
    for (let i = 0; i < rawUBOs.length; i++) {
      const u = rawUBOs[i];
      if (!u.fullName?.trim()) {
        return res
          .status(400)
          .json({ error: `UBO #${i + 1}: fullName is required.` });
      }
      if (parseOwnershipType(u.ownershipType) === "OTHER" && !u.ownershipTypeOther) {
        return res.status(400).json({
          error: `UBO #${i + 1}: ownershipTypeOther is required when type is OTHER.`,
        });
      }
    }

    const onboardingData: Prisma.CompanyOnboardingUncheckedCreateInput = {
      userId,
      agentId: payload.agentId ?? null,
      companyName: String(payload.companyName).trim(),
      email: String(payload.email).trim(),
      logoUrl: payload.logoUrl ?? null,
      companyType,
      phoneNumbers,
      registrationNumber: payload.registrationNumber
        ? String(payload.registrationNumber).trim()
        : null,
      tin: payload.tin ? String(payload.tin).trim() : null,
      incorporationDate: parseDate(payload.incorporationDate) ?? null,
      companyAddress: payload.companyAddress ? String(payload.companyAddress) : null,
      businessType: payload.businessType ? String(payload.businessType) : null,
      primaryGoal: payload.primaryGoal ? String(payload.primaryGoal) : null,
      timeHorizon: payload.timeHorizon ? String(payload.timeHorizon) : null,
      riskTolerance: payload.riskTolerance ? String(payload.riskTolerance) : null,
      investmentExperience: payload.investmentExperience
        ? String(payload.investmentExperience)
        : null,
      sourceOfIncome: payload.sourceOfIncome ? String(payload.sourceOfIncome) : null,
      expectedInvestment: payload.expectedInvestment
        ? String(payload.expectedInvestment)
        : null,
      isPEP: payload.isPEP ? String(payload.isPEP) : null,
      sanctionsOrLegal: sanctionsOrLegal || null,
      consentToDataCollection: !!payload.consentToDataCollection,
      agreeToTerms: !!payload.agreeToTerms,
      // Documents
      constitutionUrl: payload.constitutionUrl ?? null,
      tradingLicenseUrl: payload.tradingLicenseUrl ?? null,
      bankStatementUrl: String(payload.bankStatementUrl),
      tinCertificateUrl: payload.tinCertificateUrl ?? null,
      logoDocUrl: payload.logoDocUrl ?? null,
      formA1Url: payload.formA1Url ?? null,
      formS18Url: payload.formS18Url ?? null,
      form18Url: payload.form18Url ?? null,
      form20Url: payload.form20Url ?? null,
      beneficialOwnershipFormUrl: payload.beneficialOwnershipFormUrl ?? null,
      memorandumArticlesUrl: payload.memorandumArticlesUrl ?? null,
      officialAccountUrl: payload.officialAccountUrl ?? null,
      isApproved: false,
    };

    const saved = await db.$transaction(async (tx) => {
      const record = await tx.companyOnboarding.upsert({
        where: { userId },
        update: onboardingData,
        create: onboardingData,
      });

      // Replace directors
      await tx.companyDirector.deleteMany({ where: { companyOnboardingId: record.id } });
      await tx.companyDirector.createMany({
        data: rawDirectors.map((d) => ({
          companyOnboardingId: record.id,
          fullName: String(d.fullName).trim(),
          email: d.email ? String(d.email) : null,
          phone: d.phone ? String(d.phone) : null,
          address: d.address ? String(d.address) : null,
          dateOfBirth: parseDate(d.dateOfBirth) ?? undefined,
          ninOrPassportNumber: d.ninOrPassportNumber
            ? String(d.ninOrPassportNumber)
            : null,
          documentUrl: d.documentUrl ?? null,
        })),
      });

      // Replace UBOs
      await tx.companyUBO.deleteMany({ where: { companyOnboardingId: record.id } });
      if (rawUBOs.length > 0) {
        await tx.companyUBO.createMany({
          data: rawUBOs.map((u) => {
            const ownershipType = parseOwnershipType(u.ownershipType);
            return {
              companyOnboardingId: record.id,
              fullName: String(u.fullName).trim(),
              email: u.email ? String(u.email) : null,
              phone: u.phone ? String(u.phone) : null,
              address: u.address ? String(u.address) : null,
              dateOfBirth: parseDate(u.dateOfBirth) ?? undefined,
              ninOrPassportNumber: u.ninOrPassportNumber
                ? String(u.ninOrPassportNumber)
                : null,
              ownershipType,
              ownershipTypeOther:
                ownershipType === "OTHER"
                  ? String(u.ownershipTypeOther)
                  : null,
              documentUrl: u.documentUrl ?? null,
            };
          }),
        });
      }

      return tx.companyOnboarding.findUnique({
        where: { id: record.id },
        include: {
          directors: true,
          ubos: true,
          agent: {
            select: {
              id: true,
              position: true,
              user: { select: { name: true, email: true, imageUrl: true } },
            },
          },
        },
      });
    });

    return res.status(200).json({ ok: true, data: saved });
  } catch (e) {
    console.error("submitCompanyOnboarding error:", e);
    return res.status(500).json({ error: "Failed to submit company onboarding." });
  }
}

/* ─────────────────────────────────────────
   GET /onboarding/company/me
───────────────────────────────────────── */
export async function getMyCompanyOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const record = await db.companyOnboarding.findUnique({
      where: { userId },
      include: {
        directors: true,
        ubos: true,
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
    console.error("getMyCompanyOnboarding error:", e);
    return res.status(500).json({ error: "Failed to load company onboarding." });
  }
}

/* ─────────────────────────────────────────
   PUT /onboarding/company/directors
───────────────────────────────────────── */
export async function updateCompanyDirectors(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const existing = await db.companyOnboarding.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({
        error: "Company onboarding not found. Submit the main form first.",
      });
    }

    const rawDirectors: any[] = Array.isArray(req.body.directors)
      ? req.body.directors
      : [];
    if (rawDirectors.length === 0) {
      return res.status(400).json({ error: "At least one director is required." });
    }
    for (let i = 0; i < rawDirectors.length; i++) {
      if (!rawDirectors[i].fullName?.trim()) {
        return res
          .status(400)
          .json({ error: `Director #${i + 1}: fullName is required.` });
      }
    }

    await db.$transaction(async (tx) => {
      await tx.companyDirector.deleteMany({
        where: { companyOnboardingId: existing.id },
      });
      await tx.companyDirector.createMany({
        data: rawDirectors.map((d) => ({
          companyOnboardingId: existing.id,
          fullName: String(d.fullName).trim(),
          email: d.email ? String(d.email) : null,
          phone: d.phone ? String(d.phone) : null,
          address: d.address ? String(d.address) : null,
          dateOfBirth: parseDate(d.dateOfBirth) ?? undefined,
          ninOrPassportNumber: d.ninOrPassportNumber
            ? String(d.ninOrPassportNumber)
            : null,
          documentUrl: d.documentUrl ?? null,
        })),
      });
    });

    const updated = await db.companyDirector.findMany({
      where: { companyOnboardingId: existing.id },
    });
    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error("updateCompanyDirectors error:", e);
    return res.status(500).json({ error: "Failed to update directors." });
  }
}

/* ─────────────────────────────────────────
   GET /onboarding/company/directors
───────────────────────────────────────── */
export async function getCompanyDirectors(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const record = await db.companyOnboarding.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!record)
      return res.status(404).json({ error: "Company onboarding not found." });

    const directors = await db.companyDirector.findMany({
      where: { companyOnboardingId: record.id },
    });
    return res.status(200).json({ ok: true, data: directors });
  } catch (e) {
    console.error("getCompanyDirectors error:", e);
    return res.status(500).json({ error: "Failed to load directors." });
  }
}

/* ─────────────────────────────────────────
   PUT /onboarding/company/ubos
───────────────────────────────────────── */
export async function updateCompanyUBOs(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const existing = await db.companyOnboarding.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({
        error: "Company onboarding not found. Submit the main form first.",
      });
    }

    const rawUBOs: any[] = Array.isArray(req.body.ubos) ? req.body.ubos : [];
    for (let i = 0; i < rawUBOs.length; i++) {
      const u = rawUBOs[i];
      if (!u.fullName?.trim()) {
        return res
          .status(400)
          .json({ error: `UBO #${i + 1}: fullName is required.` });
      }
      if (parseOwnershipType(u.ownershipType) === "OTHER" && !u.ownershipTypeOther) {
        return res.status(400).json({
          error: `UBO #${i + 1}: ownershipTypeOther is required when type is OTHER.`,
        });
      }
    }

    await db.$transaction(async (tx) => {
      await tx.companyUBO.deleteMany({
        where: { companyOnboardingId: existing.id },
      });
      if (rawUBOs.length > 0) {
        await tx.companyUBO.createMany({
          data: rawUBOs.map((u) => {
            const ownershipType = parseOwnershipType(u.ownershipType);
            return {
              companyOnboardingId: existing.id,
              fullName: String(u.fullName).trim(),
              email: u.email ? String(u.email) : null,
              phone: u.phone ? String(u.phone) : null,
              address: u.address ? String(u.address) : null,
              dateOfBirth: parseDate(u.dateOfBirth) ?? undefined,
              ninOrPassportNumber: u.ninOrPassportNumber
                ? String(u.ninOrPassportNumber)
                : null,
              ownershipType,
              ownershipTypeOther:
                ownershipType === "OTHER" ? String(u.ownershipTypeOther) : null,
              documentUrl: u.documentUrl ?? null,
            };
          }),
        });
      }
    });

    const updated = await db.companyUBO.findMany({
      where: { companyOnboardingId: existing.id },
    });
    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error("updateCompanyUBOs error:", e);
    return res.status(500).json({ error: "Failed to update UBOs." });
  }
}

/* ─────────────────────────────────────────
   GET /onboarding/company/ubos
───────────────────────────────────────── */
export async function getCompanyUBOs(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId)
      return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const record = await db.companyOnboarding.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!record)
      return res.status(404).json({ error: "Company onboarding not found." });

    const ubos = await db.companyUBO.findMany({
      where: { companyOnboardingId: record.id },
    });
    return res.status(200).json({ ok: true, data: ubos });
  } catch (e) {
    console.error("getCompanyUBOs error:", e);
    return res.status(500).json({ error: "Failed to load UBOs." });
  }
}

/* ─────────────────────────────────────────
   POST /onboarding/validate-tin
   Checks TIN across both individual and company tables
───────────────────────────────────────── */
export async function validateTin(req: Request, res: Response) {
  try {
    const { tin, userId: bodyUserId } = req.body as {
      tin?: string;
      userId?: string;
    };
    const callerId = getUserId(req) || bodyUserId;

    if (!tin) return res.status(400).json({ error: "tin is required." });
    if (!/^\d{10}$/.test(String(tin))) {
      return res.status(400).json({ error: "TIN must be exactly 10 digits." });
    }

    const [indConflict, coConflict] = await Promise.all([
      db.individualOnboarding.findFirst({
        where: {
          tin: String(tin),
          NOT: callerId ? { userId: callerId } : undefined,
        },
        select: { id: true },
      }),
      db.companyOnboarding.findFirst({
        where: {
          tin: String(tin),
          NOT: callerId ? { userId: callerId } : undefined,
        },
        select: { id: true },
      }),
    ]);

    return res
      .status(200)
      .json({ ok: true, isUnique: !indConflict && !coConflict });
  } catch (e) {
    console.error("validateTin error:", e);
    return res.status(500).json({ error: "Failed to validate TIN." });
  }
}