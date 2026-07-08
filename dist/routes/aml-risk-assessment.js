"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aml_risk_assessment_1 = require("../controllers/aml-risk-assessment");
const auth_1 = require("../utils/auth");
const amlRouter = (0, express_1.Router)();
amlRouter.get("/aml-risk-assessment/:userId", auth_1.authenticateToken, aml_risk_assessment_1.getAMLRiskAssessment);
amlRouter.put("/aml-risk-assessment/:userId", auth_1.authenticateToken, aml_risk_assessment_1.upsertAMLRiskAssessment);
exports.default = amlRouter;
