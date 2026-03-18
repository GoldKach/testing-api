// src/routes/onboarding.ts
import { Router } from "express";
import {
  submitIndividualOnboarding,
  getMyIndividualOnboarding,
  validateTin,
} from "@/controllers/individual-onboarding";
import {
  submitCompanyOnboarding,
  getMyCompanyOnboarding,
  updateCompanyDirectors,
  updateCompanyUBOs,
  getCompanyDirectors,
  getCompanyUBOs,
} from "@/controllers/company-onboarding";

const onboardingRouter = Router();

// ─────────────────────────────────────────────
// Shared utilities
// ─────────────────────────────────────────────

// POST /onboarding/validate-tin
// Validates a TIN across both individual and company records.
onboardingRouter.post("/onboarding/validate-tin", validateTin);

// ─────────────────────────────────────────────
// Individual onboarding
// ─────────────────────────────────────────────

// POST /onboarding/individual
// Create or update individual onboarding (includes beneficiaries & next-of-kin).
onboardingRouter.post("/onboarding/individual", submitIndividualOnboarding);

// GET /onboarding/individual/me
// Fetch the caller's individual onboarding record.
onboardingRouter.get("/onboarding/individual/me", getMyIndividualOnboarding);

// ─────────────────────────────────────────────
// Company onboarding
// ─────────────────────────────────────────────

// POST /onboarding/company
// Create or update company onboarding (includes directors & UBOs).
onboardingRouter.post("/onboarding/company", submitCompanyOnboarding);

// GET /onboarding/company/me
// Fetch the caller's company onboarding record (with directors & UBOs).
onboardingRouter.get("/onboarding/company/me", getMyCompanyOnboarding);

// PUT /onboarding/company/directors
// Replace the full director list for the caller's company onboarding.
onboardingRouter.put("/onboarding/company/directors", updateCompanyDirectors);

// GET /onboarding/company/directors
// Fetch only the directors for the caller's company onboarding.
onboardingRouter.get("/onboarding/company/directors", getCompanyDirectors);

// PUT /onboarding/company/ubos
// Replace the full UBO list for the caller's company onboarding.
onboardingRouter.put("/onboarding/company/ubos", updateCompanyUBOs);

// GET /onboarding/company/ubos
// Fetch only the UBOs for the caller's company onboarding.
onboardingRouter.get("/onboarding/company/ubos", getCompanyUBOs);

export default onboardingRouter;