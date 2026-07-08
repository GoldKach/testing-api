import { Router } from "express";
import { getAMLRiskAssessment, upsertAMLRiskAssessment } from "@/controllers/aml-risk-assessment";
import { authenticateToken } from "@/utils/auth";

const amlRouter = Router();

amlRouter.get("/aml-risk-assessment/:userId", authenticateToken, getAMLRiskAssessment);
amlRouter.put("/aml-risk-assessment/:userId", authenticateToken, upsertAMLRiskAssessment);

export default amlRouter;
