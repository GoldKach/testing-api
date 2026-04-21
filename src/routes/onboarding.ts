// src/routes/onboarding.ts
import { Router } from "express";
import {
  submitIndividualOnboarding,
  getMyIndividualOnboarding,
  getIndividualOnboardingByUserId,
  validateTin,
  approveIndividualOnboarding,
  updateIndividualOnboarding,
} from "@/controllers/individual-onboarding";
import {
  submitCompanyOnboarding,
  getMyCompanyOnboarding,
  getCompanyOnboardingByUserId,
  updateCompanyDirectors,
  updateCompanyUBOs,
  getCompanyDirectors,
  getCompanyUBOs,
  approveCompanyOnboarding,
  updateCompanyOnboarding,
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
onboardingRouter.get("/onboarding/individual/user/:userId", authenticateToken, getIndividualOnboardingByUserId);
onboardingRouter.patch("/onboarding/individual/:id/approve", authenticateToken, approveIndividualOnboarding);
onboardingRouter.patch("/onboarding/individual/:id", authenticateToken, updateIndividualOnboarding);

// ─────────────────────────────────────────────
// Company onboarding
// ─────────────────────────────────────────────

onboardingRouter.post("/onboarding/company", authenticateToken, submitCompanyOnboarding);
onboardingRouter.get("/onboarding/company/me", authenticateToken, getMyCompanyOnboarding);
onboardingRouter.get("/onboarding/company/user/:userId", authenticateToken, getCompanyOnboardingByUserId);
onboardingRouter.patch("/onboarding/company/:id/approve", authenticateToken, approveCompanyOnboarding);
onboardingRouter.patch("/onboarding/company/:id", authenticateToken, updateCompanyOnboarding);
onboardingRouter.put("/onboarding/company/directors", authenticateToken, updateCompanyDirectors);
onboardingRouter.get("/onboarding/company/directors", authenticateToken, getCompanyDirectors);
onboardingRouter.put("/onboarding/company/ubos", authenticateToken, updateCompanyUBOs);
onboardingRouter.get("/onboarding/company/ubos", authenticateToken, getCompanyUBOs);

export default onboardingRouter;