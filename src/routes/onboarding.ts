// src/routes/onboarding.ts
import { getMyOnboarding, submitOnboarding, validateTin } from "@/controllers/onboarding";
import { Router } from "express";

const onboardingRouter = Router();

// If you add auth later, put your auth middleware before these.
onboardingRouter.post("/onboarding", submitOnboarding);
onboardingRouter.get("/onboarding/me", getMyOnboarding);
onboardingRouter.post("/onboarding/validate-tin", validateTin);

export default onboardingRouter;
