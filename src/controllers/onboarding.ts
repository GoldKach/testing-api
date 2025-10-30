


// src/controllers/onboarding.ts
import { Request, Response } from "express";
import { db } from "@/db/db";
import { Prisma } from "@prisma/client";

/** Pull user id from auth (req.user) OR allow passing it in body/query for your localStorage flow. */
function getUserId(req: Request): string | undefined {
  return (req as any)?.user?.id || (req.body?.userId as string) || (req.query?.userId as string);
}

function parseDate(d?: string | null): Date | null {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x.getTime()) ? null : x;
}

function requireFields(obj: Record<string, any>, fields: string[]) {
  return fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === "");
}

/**
 * POST /onboarding
 * Creates or updates a user's EntityOnboarding (unique by userId).
 * Accepts userId from auth or body/query.
 */
export async function submitOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const payload = req.body as any;

    // Normalize
    const entityType = String(payload.entityType || "").trim(); // "individual" | "company"
    const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim(); // "yes" | "no"

    if (!entityType) return res.status(400).json({ error: "entityType is required." });
    if (sanctionsOrLegal.toLowerCase() === "yes") {
      return res.status(400).json({ error: "Cannot open account due to sanctions/legal history." });
    }

    // Per-entity validation
    if (entityType === "individual") {
      const missing = requireFields(payload, [
        "fullName",
        "dateOfBirth",
        "tin",
        "homeAddress",
        "email",
        "phoneNumber",
        "employmentStatus",
        "occupation",
        "primaryGoal",
        "timeHorizon",
        "riskTolerance",
        "investmentExperience",
      ]);
      if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
      if (!/^\d{10}$/.test(String(payload.tin))) {
        return res.status(400).json({ error: "TIN must be exactly 10 digits." });
      }
    } else if (entityType === "company") {
      const missing = requireFields(payload, [
        "companyName",
        "registrationNumber",
        "companyAddress",
        "businessType",
        "incorporationDate",
        "authorizedRepName",
        "authorizedRepEmail",
        "authorizedRepPhone",
        "authorizedRepPosition",
        "primaryGoal",
        "timeHorizon",
        "riskTolerance",
        "investmentExperience",
      ]);
      if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(", ")}` });
    }

    // Enforce TIN uniqueness (ignore this user’s own record)
    if (payload.tin) {
      const conflict = await db.entityOnboarding.findFirst({
        where: { tin: String(payload.tin), NOT: { userId } },
        select: { id: true },
      });
      if (conflict) return res.status(409).json({ error: "TIN already in use." });
    }

    // Dates
    const dateOfBirth = parseDate(payload.dateOfBirth) ?? new Date("1900-01-01T00:00:00Z");
    const incorporationDate = parseDate(payload.incorporationDate); // optional in your schema
    const establishmentDate =
      parseDate(payload.establishmentDate) ?? new Date("1900-01-01T00:00:00Z"); // REQUIRED in your schema

    // Build a typed payload to catch mismatches at compile time
    const data: Prisma.EntityOnboardingUncheckedCreateInput = {
      userId,
      entityType,
      fullName: String(payload.fullName || ""),
      dateOfBirth,
      tin: String(payload.tin || "").trim(),

      avatarUrl: payload.avatarUrl ?? null,
      idUrl: payload.idUrl ?? null,

      homeAddress: String(payload.homeAddress || ""),
      email: String(payload.email || ""),
      phoneNumber: String(payload.phoneNumber || ""),
      employmentStatus: String(payload.employmentStatus || ""),
      occupation: String(payload.occupation || ""),

      companyName: payload.companyName ?? null,
      hasBusiness: payload.hasBusiness ?? null,
      registrationNumber: payload.registrationNumber ?? null,
      companyAddress: payload.companyAddress ?? null,
      businessType: payload.businessType ?? null,
      incorporationDate: incorporationDate ?? null,

      authorizedRepName: payload.authorizedRepName ?? null,
      authorizedRepEmail: payload.authorizedRepEmail ?? null,
      authorizedRepPhone: payload.authorizedRepPhone ?? null,
      authorizedRepPosition: payload.authorizedRepPosition ?? null,

      primaryGoal: String(payload.primaryGoal || ""),
      timeHorizon: String(payload.timeHorizon || ""),
      riskTolerance: String(payload.riskTolerance || ""),
      investmentExperience: String(payload.investmentExperience || ""),

      isPEP: String(payload.isPEP || ""),
      consentToDataCollection: !!payload.consentToDataCollection,
      agreeToTerms: !!payload.agreeToTerms,

      sourceOfWealth: String(payload.sourceOfWealth || ""),
      businessOwnership: String(payload.businessOwnership || ""),
      employmentIncome: String(payload.employmentIncome || ""),
      expectedInvestment: String(payload.expectedInvestment || ""),

      // These are required in your current schema – never null:
      businessName: String(payload.businessName || ""),
      businessAddress: String(payload.businessAddress || ""),
      establishmentDate,
      ownershipPercentage: String(payload.ownershipPercentage || ""),
      familyMemberDetails: String(payload.familyMemberDetails || ""),
      publicPosition: String(payload.publicPosition || ""),
      relationshipToCountry: String(payload.relationshipToCountry || ""),
      sanctionsOrLegal, // "yes"|"no" (we already blocked "yes")
      // isApproved defaults to false
    };

    const saved = await db.entityOnboarding.upsert({
      where: { userId },
      update: data,
      create: data,
    });

    return res.status(200).json({ ok: true, data: saved });
  } catch (e) {
    console.error("submitOnboarding error:", e);
    return res.status(500).json({ error: "Failed to submit onboarding." });
  }
}

/**
 * GET /onboarding/me
 * Returns the caller's onboarding record (or null).
 * Accepts userId from auth or `?userId=...` for your localStorage flow.
 */
export async function getMyOnboarding(req: Request, res: Response) {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated (userId missing)." });

    const record = await db.entityOnboarding.findUnique({ where: { userId } });
    return res.status(200).json({ ok: true, data: record || null });
  } catch (e) {
    console.error("getMyOnboarding error:", e);
    return res.status(500).json({ error: "Failed to load onboarding." });
  }
}

/**
 * POST /onboarding/validate-tin
 * Body: { tin: string; userId?: string }
 * Returns { isUnique: boolean }
 */
export async function validateTin(req: Request, res: Response) {
  try {
    const { tin, userId: bodyUserId } = req.body as { tin?: string; userId?: string };
    const callerId = getUserId(req) || bodyUserId;

    if (!tin) return res.status(400).json({ error: "tin is required." });
    if (!/^\d{10}$/.test(String(tin))) {
      return res.status(400).json({ error: "TIN must be exactly 10 digits." });
    }

    const conflict = await db.entityOnboarding.findFirst({
      where: { tin: String(tin), NOT: callerId ? { userId: callerId } : undefined },
      select: { id: true },
    });

    return res.status(200).json({ ok: true, isUnique: !conflict });
  } catch (e) {
    console.error("validateTin error:", e);
    return res.status(500).json({ error: "Failed to validate TIN." });
  }
}
