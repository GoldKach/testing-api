// src/controllers/company-onboarding.ts
import { Request, Response } from "express";
import { db } from "@/db/db";
import { CompanyType, OwnershipType, Prisma } from "@prisma/client";

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

function parseCompanyType(v?: string): CompanyType {
  const map: Record<string, CompanyType> = {
    LIMITED: "LIMITED",
    PARTNERSHIP: "PARTNERSHIP",
    NGO: "NGO",
    COOPERATIVE: "COOPERATIVE",
    SAVINGS_GROUP: "SAVINGS_GROUP",
    MICROFINANCE: "MICROFINANCE",
  };
  const key = String(v || "").toUpperCase().replace(/\s+/g, "_");
  return map[key] ?? "LIMITED";
}

function parseOwnershipType(v?: string): OwnershipType {
  const map: Record<string, OwnershipType> = {
    OWNERSHIP_BY_SENIOR: "OWNERSHIP_BY_SENIOR",
    MANAGEMENT_OFFICIAL: "MANAGEMENT_OFFICIAL",
    OTHER: "OTHER",
  };
  const key = String(v || "").toUpperCase().replace(/\s+/g, "_");
  return map[key] ?? "OTHER";
}

// ---------------------------------------------------------------------------
// POST /onboarding/company
// Creates or updates a CompanyOnboarding for the authenticated user.
//
// Body shape:
// {
//   companyName (required), email (required), logoUrl?, companyType (required),
//   phoneNumbers: string[] (required, at least 1),
//   registrationNumber?, tin?, incorporationDate?, companyAddress?, businessType?,
//   primaryGoal?, timeHorizon?, riskTolerance?, investmentExperience?,
//   sourceOfIncome?, expectedInvestment?,
//   isPEP?, sanctionsOrLegal, consentToDataCollection, agreeToTerms,
//
//   // Documents (bankStatementUrl required; constitutionUrl required for SAVINGS_GROUP/MICROFINANCE)
//   constitutionUrl?, tradingLicenseUrl?, bankStatementUrl (required),
//   tinCertificateUrl?, logoDocUrl?, formA1Url?, formS18Url?, form18Url?,
//   form20Url?, beneficialOwnershipFormUrl?, memorandumArticlesUrl?,
//   officialAccountUrl?,
//
//   agentId?,
//
//   directors: [                         // at least 1 required
//     {
//       fullName (required), email?, phone?, address?, dateOfBirth?,
//       ninOrPassportNumber?, documentUrl?
//     }
//   ],
//
//   ubos: [                              // optional (may be same as directors)
//     {
//       fullName (required), email?, phone?, address?, dateOfBirth?,
//       ninOrPassportNumber?,
//       ownershipType?,                  // OWNERSHIP_BY_SENIOR | MANAGEMENT_OFFICIAL | OTHER
//       ownershipTypeOther?,             // required if ownershipType = OTHER
//       documentUrl?
//     }
//   ]
// }
// ---------------------------------------------------------------------------
export async function submitCompanyOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const payload = req.body as any;

    // --- Required company fields ---
    const missing = requireFields(payload, ["companyName", "email", "companyType"]);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }

    // --- Phone numbers ---
    const phoneNumbers: string[] = Array.isArray(payload.phoneNumbers)
      ? payload.phoneNumbers.map(String).filter(Boolean)
      : [];
    if (phoneNumbers.length === 0) {
      return res.status(400).json({ error: "At least one official phone number is required." });
    }

    // --- Sanctions check ---
    const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim().toLowerCase();
    if (sanctionsOrLegal === "yes") {
      return res.status(400).json({ error: "Cannot open account due to sanctions/legal history." });
    }

    // --- Required document: bank statement ---
    if (!payload.bankStatementUrl) {
      return res.status(400).json({ error: "Bank statement upload is required." });
    }

    // --- SACCO / savings group requires constitution ---
    const companyType = parseCompanyType(payload.companyType);
    if (
      (companyType === "SAVINGS_GROUP" || companyType === "MICROFINANCE") &&
      !payload.constitutionUrl
    ) {
      return res.status(400).json({
        error: "Constitution document is required for SACCOs / savings groups / microfinance.",
      });
    }

    // --- TIN uniqueness if provided ---
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

    // --- Registration number uniqueness ---
    if (payload.registrationNumber) {
      const regConflict = await db.companyOnboarding.findFirst({
        where: { registrationNumber: String(payload.registrationNumber), NOT: { userId } },
        select: { id: true },
      });
      if (regConflict) {
        return res.status(409).json({ error: "Registration number is already in use." });
      }
    }

    // --- Directors validation (at least 1) ---
    const rawDirectors: any[] = Array.isArray(payload.directors) ? payload.directors : [];
    if (rawDirectors.length === 0) {
      return res.status(400).json({ error: "At least one company director is required." });
    }
    for (let i = 0; i < rawDirectors.length; i++) {
      const d = rawDirectors[i];
      if (!d.fullName || String(d.fullName).trim() === "") {
        return res.status(400).json({ error: `Director #${i + 1}: fullName is required.` });
      }
    }

    // --- UBOs validation (optional; if provided, fullName required) ---
    const rawUBOs: any[] = Array.isArray(payload.ubos) ? payload.ubos : [];
    for (let i = 0; i < rawUBOs.length; i++) {
      const u = rawUBOs[i];
      if (!u.fullName || String(u.fullName).trim() === "") {
        return res.status(400).json({ error: `UBO #${i + 1}: fullName is required.` });
      }
      if (parseOwnershipType(u.ownershipType) === "OTHER" && !u.ownershipTypeOther) {
        return res.status(400).json({
          error: `UBO #${i + 1}: ownershipTypeOther explanation is required when type is OTHER.`,
        });
      }
    }

    // --- Build main data ---
    const onboardingData: Prisma.CompanyOnboardingUncheckedCreateInput = {
      userId,
      agentId: payload.agentId ?? null,

      companyName: String(payload.companyName).trim(),
      email: String(payload.email).trim(),
      logoUrl: payload.logoUrl ?? null,
      companyType,
      phoneNumbers,

      registrationNumber: payload.registrationNumber ? String(payload.registrationNumber).trim() : null,
      tin: payload.tin ? String(payload.tin).trim() : null,
      incorporationDate: parseDate(payload.incorporationDate) ?? null,
      companyAddress: payload.companyAddress ? String(payload.companyAddress) : null,
      businessType: payload.businessType ? String(payload.businessType) : null,

      primaryGoal: payload.primaryGoal ? String(payload.primaryGoal) : null,
      timeHorizon: payload.timeHorizon ? String(payload.timeHorizon) : null,
      riskTolerance: payload.riskTolerance ? String(payload.riskTolerance) : null,
      investmentExperience: payload.investmentExperience ? String(payload.investmentExperience) : null,
      sourceOfIncome: payload.sourceOfIncome ? String(payload.sourceOfIncome) : null,
      expectedInvestment: payload.expectedInvestment ? String(payload.expectedInvestment) : null,

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
      if (rawDirectors.length > 0) {
        await tx.companyDirector.createMany({
          data: rawDirectors.map((d) => ({
            companyOnboardingId: record.id,
            fullName: String(d.fullName).trim(),
            email: d.email ? String(d.email) : null,
            phone: d.phone ? String(d.phone) : null,
            address: d.address ? String(d.address) : null,
            dateOfBirth: parseDate(d.dateOfBirth) ?? undefined,
            ninOrPassportNumber: d.ninOrPassportNumber ? String(d.ninOrPassportNumber) : null,
            documentUrl: d.documentUrl ?? null,
          })),
        });
      }

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
              ninOrPassportNumber: u.ninOrPassportNumber ? String(u.ninOrPassportNumber) : null,
              ownershipType,
              ownershipTypeOther: ownershipType === "OTHER" ? String(u.ownershipTypeOther) : null,
              documentUrl: u.documentUrl ?? null,
            };
          }),
        });
      }

      return record.id;
    }, { timeout: 30000 }); // 30s timeout — directors/UBOs can be large

    // Fetch the full record outside the transaction (no atomicity needed here)
    const result = await db.companyOnboarding.findUnique({
      where: { id: saved },
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

    return res.status(200).json({ ok: true, data: result });
  } catch (e) {
    console.error("submitCompanyOnboarding error:", e);
    return res.status(500).json({ error: "Failed to submit company onboarding." });
  }
}

// ---------------------------------------------------------------------------
// GET /onboarding/company/me
// ---------------------------------------------------------------------------
export async function getMyCompanyOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

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

// ---------------------------------------------------------------------------
// PUT /onboarding/company/directors
// Replaces the director list for the authenticated user's company onboarding.
// Body: { directors: Director[] }
// ---------------------------------------------------------------------------
export async function updateCompanyDirectors(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const existing = await db.companyOnboarding.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Company onboarding record not found. Submit the main form first." });
    }

    const rawDirectors: any[] = Array.isArray(req.body.directors) ? req.body.directors : [];
    if (rawDirectors.length === 0) {
      return res.status(400).json({ error: "At least one director is required." });
    }
    for (let i = 0; i < rawDirectors.length; i++) {
      if (!rawDirectors[i].fullName || String(rawDirectors[i].fullName).trim() === "") {
        return res.status(400).json({ error: `Director #${i + 1}: fullName is required.` });
      }
    }

    await db.$transaction(async (tx) => {
      await tx.companyDirector.deleteMany({ where: { companyOnboardingId: existing.id } });
      await tx.companyDirector.createMany({
        data: rawDirectors.map((d) => ({
          companyOnboardingId: existing.id,
          fullName: String(d.fullName).trim(),
          email: d.email ? String(d.email) : null,
          phone: d.phone ? String(d.phone) : null,
          address: d.address ? String(d.address) : null,
          dateOfBirth: parseDate(d.dateOfBirth) ?? undefined,
          ninOrPassportNumber: d.ninOrPassportNumber ? String(d.ninOrPassportNumber) : null,
          documentUrl: d.documentUrl ?? null,
        })),
      });
    });

    const updated = await db.companyDirector.findMany({ where: { companyOnboardingId: existing.id } });
    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error("updateCompanyDirectors error:", e);
    return res.status(500).json({ error: "Failed to update directors." });
  }
}

// ---------------------------------------------------------------------------
// PUT /onboarding/company/ubos
// Replaces the UBO list for the authenticated user's company onboarding.
// Body: { ubos: UBO[] }
// ---------------------------------------------------------------------------
export async function updateCompanyUBOs(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const existing = await db.companyOnboarding.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({ error: "Company onboarding record not found. Submit the main form first." });
    }

    const rawUBOs: any[] = Array.isArray(req.body.ubos) ? req.body.ubos : [];
    for (let i = 0; i < rawUBOs.length; i++) {
      const u = rawUBOs[i];
      if (!u.fullName || String(u.fullName).trim() === "") {
        return res.status(400).json({ error: `UBO #${i + 1}: fullName is required.` });
      }
      if (parseOwnershipType(u.ownershipType) === "OTHER" && !u.ownershipTypeOther) {
        return res.status(400).json({
          error: `UBO #${i + 1}: ownershipTypeOther explanation is required when type is OTHER.`,
        });
      }
    }

    await db.$transaction(async (tx) => {
      await tx.companyUBO.deleteMany({ where: { companyOnboardingId: existing.id } });
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
              ninOrPassportNumber: u.ninOrPassportNumber ? String(u.ninOrPassportNumber) : null,
              ownershipType,
              ownershipTypeOther: ownershipType === "OTHER" ? String(u.ownershipTypeOther) : null,
              documentUrl: u.documentUrl ?? null,
            };
          }),
        });
      }
    });

    const updated = await db.companyUBO.findMany({ where: { companyOnboardingId: existing.id } });
    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error("updateCompanyUBOs error:", e);
    return res.status(500).json({ error: "Failed to update UBOs." });
  }
}

// ---------------------------------------------------------------------------
// GET /onboarding/company/directors  (admin / agent use)
// GET /onboarding/company/ubos       (admin / agent use)
// ---------------------------------------------------------------------------
export async function getCompanyDirectors(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const record = await db.companyOnboarding.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!record) return res.status(404).json({ error: "Company onboarding not found." });

    const directors = await db.companyDirector.findMany({
      where: { companyOnboardingId: record.id },
    });
    return res.status(200).json({ ok: true, data: directors });
  } catch (e) {
    console.error("getCompanyDirectors error:", e);
    return res.status(500).json({ error: "Failed to load directors." });
  }
}

export async function getCompanyUBOs(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const record = await db.companyOnboarding.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!record) return res.status(404).json({ error: "Company onboarding not found." });

    const ubos = await db.companyUBO.findMany({ where: { companyOnboardingId: record.id } });
    return res.status(200).json({ ok: true, data: ubos });
  } catch (e) {
    console.error("getCompanyUBOs error:", e);
    return res.status(500).json({ error: "Failed to load UBOs." });
  }
}

// ---------------------------------------------------------------------------
// PATCH /onboarding/company/:id/approve
// Sets isApproved = true on the CompanyOnboarding record.
// ---------------------------------------------------------------------------
export async function approveCompanyOnboarding(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const record = await db.companyOnboarding.findUnique({ where: { id }, select: { id: true } });
    if (!record) return res.status(404).json({ error: "Company onboarding record not found." });

    const updated = await db.companyOnboarding.update({
      where: { id },
      data: { isApproved: true },
      select: { id: true, userId: true, isApproved: true, updatedAt: true },
    });

    return res.status(200).json({ ok: true, data: updated });
  } catch (e) {
    console.error("approveCompanyOnboarding error:", e);
    return res.status(500).json({ error: "Failed to approve onboarding." });
  }
}