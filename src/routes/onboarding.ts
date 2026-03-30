// src/routes/onboarding.ts
import { Router } from "express";
import {
  submitIndividualOnboarding,
  getMyIndividualOnboarding,
  validateTin,
  approveIndividualOnboarding,
} from "@/controllers/individual-onboarding";
import {
  submitCompanyOnboarding,
  getMyCompanyOnboarding,
  updateCompanyDirectors,
  updateCompanyUBOs,
  getCompanyDirectors,
  getCompanyUBOs,
  approveCompanyOnboarding,
} from "@/controllers/company-onboarding";
import { authenticateToken } from "@/utils/auth";

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

onboardingRouter.post("/onboarding/individual", authenticateToken, submitIndividualOnboarding);
onboardingRouter.get("/onboarding/individual/me", authenticateToken, getMyIndividualOnboarding);
onboardingRouter.patch("/onboarding/individual/:id/approve", authenticateToken, approveIndividualOnboarding);

// ─────────────────────────────────────────────
// Company onboarding
// ─────────────────────────────────────────────

onboardingRouter.post("/onboarding/company", authenticateToken, submitCompanyOnboarding);
onboardingRouter.get("/onboarding/company/me", authenticateToken, getMyCompanyOnboarding);
onboardingRouter.patch("/onboarding/company/:id/approve", authenticateToken, approveCompanyOnboarding);
onboardingRouter.put("/onboarding/company/directors", authenticateToken, updateCompanyDirectors);
onboardingRouter.get("/onboarding/company/directors", authenticateToken, getCompanyDirectors);
onboardingRouter.put("/onboarding/company/ubos", authenticateToken, updateCompanyUBOs);
onboardingRouter.get("/onboarding/company/ubos", authenticateToken, getCompanyUBOs);

export default onboardingRouter;