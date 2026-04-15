"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitIndividualOnboarding = submitIndividualOnboarding;
exports.getMyIndividualOnboarding = getMyIndividualOnboarding;
exports.validateTin = validateTin;
exports.approveIndividualOnboarding = approveIndividualOnboarding;
const db_1 = require("../db/db");
function getUserId(req) {
    var _a;
    return (_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.userId;
}
function parseDate(d) {
    if (!d)
        return null;
    const x = new Date(d);
    return isNaN(x.getTime()) ? null : x;
}
function requireFields(obj, fields) {
    return fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === "");
}
function parseBeneficiaryRelation(v) {
    var _a;
    const map = {
        SPOUSE: "SPOUSE",
        CHILD: "CHILD",
        PARENT: "PARENT",
        SIBLING: "SIBLING",
        OTHER: "OTHER",
    };
    return (_a = map[String(v || "").toUpperCase()]) !== null && _a !== void 0 ? _a : "OTHER";
}
function submitIndividualOnboarding(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const payload = req.body;
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
            const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim().toLowerCase();
            if (sanctionsOrLegal === "yes") {
                return res.status(400).json({ error: "Cannot open account due to sanctions/legal history." });
            }
            if (!payload.nationalIdUrl) {
                return res.status(400).json({ error: "National ID / Passport upload is required." });
            }
            if (payload.tin) {
                if (!/^\d{10}$/.test(String(payload.tin))) {
                    return res.status(400).json({ error: "TIN must be exactly 10 digits." });
                }
                const conflict = yield db_1.db.individualOnboarding.findFirst({
                    where: { tin: String(payload.tin), NOT: { userId } },
                    select: { id: true },
                });
                if (conflict)
                    return res.status(409).json({ error: "TIN is already in use." });
            }
            const rawBeneficiaries = Array.isArray(payload.beneficiaries) ? payload.beneficiaries : [];
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
            const rawNextOfKin = Array.isArray(payload.nextOfKin) ? payload.nextOfKin : [];
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
            let resolvedAgentId = (_a = payload.agentId) !== null && _a !== void 0 ? _a : null;
            if (resolvedAgentId) {
                const agentExists = yield db_1.db.staffProfile.findUnique({
                    where: { id: resolvedAgentId },
                    select: { id: true },
                });
                if (!agentExists)
                    resolvedAgentId = null;
            }
            const onboardingData = {
                userId,
                agentId: resolvedAgentId,
                fullName: String(payload.fullName),
                dateOfBirth: (_b = parseDate(payload.dateOfBirth)) !== null && _b !== void 0 ? _b : undefined,
                tin: payload.tin ? String(payload.tin).trim() : null,
                avatarUrl: (_c = payload.avatarUrl) !== null && _c !== void 0 ? _c : null,
                homeAddress: String(payload.homeAddress),
                email: String(payload.email),
                phoneNumber: String(payload.phoneNumber),
                employmentStatus: String(payload.employmentStatus),
                occupation: String(payload.occupation),
                companyName: (_d = payload.companyName) !== null && _d !== void 0 ? _d : null,
                hasBusiness: (_e = payload.hasBusiness) !== null && _e !== void 0 ? _e : null,
                primaryGoal: String(payload.primaryGoal),
                timeHorizon: String(payload.timeHorizon),
                riskTolerance: String(payload.riskTolerance),
                investmentExperience: String(payload.investmentExperience),
                sourceOfIncome: String(payload.sourceOfIncome),
                employmentIncome: String(payload.employmentIncome),
                expectedInvestment: String(payload.expectedInvestment),
                businessOwnership: (_f = payload.businessOwnership) !== null && _f !== void 0 ? _f : null,
                isPEP: payload.isPEP ? String(payload.isPEP) : null,
                publicPosition: (_g = payload.publicPosition) !== null && _g !== void 0 ? _g : null,
                relationshipToCountry: (_h = payload.relationshipToCountry) !== null && _h !== void 0 ? _h : null,
                familyMemberDetails: (_j = payload.familyMemberDetails) !== null && _j !== void 0 ? _j : null,
                sanctionsOrLegal: sanctionsOrLegal || null,
                consentToDataCollection: !!payload.consentToDataCollection,
                agreeToTerms: !!payload.agreeToTerms,
                nationalIdUrl: String(payload.nationalIdUrl),
                passportPhotoUrl: (_k = payload.passportPhotoUrl) !== null && _k !== void 0 ? _k : null,
                tinCertificateUrl: (_l = payload.tinCertificateUrl) !== null && _l !== void 0 ? _l : null,
                bankStatementUrl: (_m = payload.bankStatementUrl) !== null && _m !== void 0 ? _m : null,
                isApproved: false,
            };
            const saved = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const record = yield tx.individualOnboarding.upsert({
                    where: { userId },
                    update: onboardingData,
                    create: onboardingData,
                });
                yield tx.beneficiary.deleteMany({ where: { individualOnboardingId: record.id } });
                if (rawBeneficiaries.length > 0) {
                    yield tx.beneficiary.createMany({
                        data: rawBeneficiaries.map((b) => {
                            var _a, _b;
                            return ({
                                individualOnboardingId: record.id,
                                fullName: String(b.fullName),
                                dateOfBirth: (_a = parseDate(b.dateOfBirth)) !== null && _a !== void 0 ? _a : undefined,
                                phone: String(b.phone),
                                address: b.address ? String(b.address) : null,
                                relation: parseBeneficiaryRelation(b.relation),
                                tin: b.tin ? String(b.tin).trim() : null,
                                documentUrl: (_b = b.documentUrl) !== null && _b !== void 0 ? _b : null,
                            });
                        }),
                    });
                }
                yield tx.nextOfKin.deleteMany({ where: { individualOnboardingId: record.id } });
                if (rawNextOfKin.length > 0) {
                    yield tx.nextOfKin.createMany({
                        data: rawNextOfKin.map((n) => {
                            var _a, _b;
                            return ({
                                individualOnboardingId: record.id,
                                fullName: String(n.fullName),
                                dateOfBirth: (_a = parseDate(n.dateOfBirth)) !== null && _a !== void 0 ? _a : undefined,
                                phone: String(n.phone),
                                address: n.address ? String(n.address) : null,
                                relation: parseBeneficiaryRelation(n.relation),
                                tin: n.tin ? String(n.tin).trim() : null,
                                documentUrl: (_b = n.documentUrl) !== null && _b !== void 0 ? _b : null,
                            });
                        }),
                    });
                }
                return tx.individualOnboarding.findUnique({
                    where: { id: record.id },
                    include: { beneficiaries: true, nextOfKin: true, agent: { select: { id: true, position: true, user: { select: { name: true, email: true } } } } },
                });
            }));
            return res.status(200).json({ ok: true, data: saved });
        }
        catch (e) {
            console.error("submitIndividualOnboarding error:", e);
            return res.status(500).json({ error: "Failed to submit individual onboarding." });
        }
    });
}
function getMyIndividualOnboarding(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const record = yield db_1.db.individualOnboarding.findUnique({
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
        }
        catch (e) {
            console.error("getMyIndividualOnboarding error:", e);
            return res.status(500).json({ error: "Failed to load individual onboarding." });
        }
    });
}
function validateTin(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { tin, userId: bodyUserId } = req.body;
            const callerId = getUserId(req) || bodyUserId;
            if (!tin)
                return res.status(400).json({ error: "tin is required." });
            if (!/^\d{10}$/.test(String(tin))) {
                return res.status(400).json({ error: "TIN must be exactly 10 digits." });
            }
            const [indConflict, coConflict] = yield Promise.all([
                db_1.db.individualOnboarding.findFirst({
                    where: { tin: String(tin), NOT: callerId ? { userId: callerId } : undefined },
                    select: { id: true },
                }),
                db_1.db.companyOnboarding.findFirst({
                    where: { tin: String(tin), NOT: callerId ? { userId: callerId } : undefined },
                    select: { id: true },
                }),
            ]);
            return res.status(200).json({ ok: true, isUnique: !indConflict && !coConflict });
        }
        catch (e) {
            console.error("validateTin error:", e);
            return res.status(500).json({ error: "Failed to validate TIN." });
        }
    });
}
function approveIndividualOnboarding(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            const record = yield db_1.db.individualOnboarding.findUnique({ where: { id }, select: { id: true } });
            if (!record)
                return res.status(404).json({ error: "Individual onboarding record not found." });
            const updated = yield db_1.db.individualOnboarding.update({
                where: { id },
                data: { isApproved: true },
                select: { id: true, userId: true, isApproved: true, updatedAt: true },
            });
            return res.status(200).json({ ok: true, data: updated });
        }
        catch (e) {
            console.error("approveIndividualOnboarding error:", e);
            return res.status(500).json({ error: "Failed to approve onboarding." });
        }
    });
}
