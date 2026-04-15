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
exports.submitCompanyOnboarding = submitCompanyOnboarding;
exports.getMyCompanyOnboarding = getMyCompanyOnboarding;
exports.updateCompanyDirectors = updateCompanyDirectors;
exports.getCompanyDirectors = getCompanyDirectors;
exports.updateCompanyUBOs = updateCompanyUBOs;
exports.getCompanyUBOs = getCompanyUBOs;
exports.validateTin = validateTin;
const db_1 = require("../db/db");
function getUserId(req) {
    var _a, _b, _c;
    return (((_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.id) ||
        ((_b = req.body) === null || _b === void 0 ? void 0 : _b.userId) ||
        ((_c = req.query) === null || _c === void 0 ? void 0 : _c.userId));
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
function parseCompanyType(v) {
    var _a;
    const map = {
        LIMITED: "LIMITED",
        PARTNERSHIP: "PARTNERSHIP",
        NGO: "NGO",
        COOPERATIVE: "COOPERATIVE",
        SAVINGS_GROUP: "SAVINGS_GROUP",
        MICROFINANCE: "MICROFINANCE",
    };
    return (_a = map[String(v || "").toUpperCase().replace(/\s+/g, "_")]) !== null && _a !== void 0 ? _a : "LIMITED";
}
function parseOwnershipType(v) {
    var _a;
    const map = {
        OWNERSHIP_BY_SENIOR: "OWNERSHIP_BY_SENIOR",
        MANAGEMENT_OFFICIAL: "MANAGEMENT_OFFICIAL",
        OTHER: "OTHER",
    };
    return (_a = map[String(v || "").toUpperCase().replace(/\s+/g, "_")]) !== null && _a !== void 0 ? _a : "OTHER";
}
function submitIndividualOnboarding(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const payload = req.body;
            let resolvedAgentId = (_a = payload.agentId) !== null && _a !== void 0 ? _a : null;
            if (resolvedAgentId) {
                const agentExists = yield db_1.db.staffProfile.findUnique({
                    where: { id: resolvedAgentId },
                    select: { id: true },
                });
                if (!agentExists)
                    resolvedAgentId = null;
            }
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
            const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim().toLowerCase();
            if (sanctionsOrLegal === "yes") {
                return res
                    .status(400)
                    .json({ error: "Cannot open account due to sanctions/legal history." });
            }
            if (!payload.nationalIdUrl) {
                return res
                    .status(400)
                    .json({ error: "National ID / Passport upload is required." });
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
            const rawBeneficiaries = Array.isArray(payload.beneficiaries)
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
            const rawNextOfKin = Array.isArray(payload.nextOfKin)
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
                yield tx.nextOfKin.deleteMany({ where: { individualOnboardingId: record.id } });
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
            }));
            return res.status(200).json({ ok: true, data: saved });
        }
        catch (e) {
            console.error("submitIndividualOnboarding error:", e);
            if ((e === null || e === void 0 ? void 0 : e.code) === "P2002") {
                const field = (_q = (_p = (_o = e === null || e === void 0 ? void 0 : e.meta) === null || _o === void 0 ? void 0 : _o.target) === null || _p === void 0 ? void 0 : _p[0]) !== null && _q !== void 0 ? _q : "field";
                return res.status(409).json({ error: `${field === "tin" ? "TIN" : field} is already in use by another account.` });
            }
            const errMsg = ((_s = (_r = e === null || e === void 0 ? void 0 : e.response) === null || _r === void 0 ? void 0 : _r.data) === null || _s === void 0 ? void 0 : _s.error) || (e === null || e === void 0 ? void 0 : e.message) || ((_t = e === null || e === void 0 ? void 0 : e.meta) === null || _t === void 0 ? void 0 : _t.cause) || "Failed to submit individual onboarding.";
            return res.status(500).json({ error: errMsg });
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
function submitCompanyOnboarding(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const payload = req.body;
            const missing = requireFields(payload, ["companyName", "email", "companyType"]);
            if (missing.length) {
                return res
                    .status(400)
                    .json({ error: `Missing required fields: ${missing.join(", ")}` });
            }
            const phoneNumbers = Array.isArray(payload.phoneNumbers)
                ? payload.phoneNumbers.map(String).filter(Boolean)
                : [];
            if (phoneNumbers.length === 0) {
                return res
                    .status(400)
                    .json({ error: "At least one official phone number is required." });
            }
            const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim().toLowerCase();
            if (sanctionsOrLegal === "yes") {
                return res
                    .status(400)
                    .json({ error: "Cannot open account due to sanctions/legal history." });
            }
            if (!payload.bankStatementUrl) {
                return res.status(400).json({ error: "Bank statement upload is required." });
            }
            const companyType = parseCompanyType(payload.companyType);
            if ((companyType === "SAVINGS_GROUP" || companyType === "MICROFINANCE") &&
                !payload.constitutionUrl) {
                return res.status(400).json({
                    error: "Constitution document is required for SACCOs / savings groups / microfinance.",
                });
            }
            if (payload.tin) {
                if (!/^\d{10}$/.test(String(payload.tin))) {
                    return res.status(400).json({ error: "TIN must be exactly 10 digits." });
                }
                const [indConflict, coConflict] = yield Promise.all([
                    db_1.db.individualOnboarding.findFirst({
                        where: { tin: String(payload.tin), NOT: { userId } },
                        select: { id: true },
                    }),
                    db_1.db.companyOnboarding.findFirst({
                        where: { tin: String(payload.tin), NOT: { userId } },
                        select: { id: true },
                    }),
                ]);
                if (indConflict || coConflict) {
                    return res.status(409).json({ error: "TIN is already in use." });
                }
            }
            if (payload.registrationNumber) {
                const regConflict = yield db_1.db.companyOnboarding.findFirst({
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
            const rawDirectors = Array.isArray(payload.directors)
                ? payload.directors
                : [];
            if (rawDirectors.length === 0) {
                return res
                    .status(400)
                    .json({ error: "At least one company director is required." });
            }
            for (let i = 0; i < rawDirectors.length; i++) {
                if (!((_a = rawDirectors[i].fullName) === null || _a === void 0 ? void 0 : _a.trim())) {
                    return res
                        .status(400)
                        .json({ error: `Director #${i + 1}: fullName is required.` });
                }
            }
            const rawUBOs = Array.isArray(payload.ubos) ? payload.ubos : [];
            for (let i = 0; i < rawUBOs.length; i++) {
                const u = rawUBOs[i];
                if (!((_b = u.fullName) === null || _b === void 0 ? void 0 : _b.trim())) {
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
            const onboardingData = {
                userId,
                agentId: (_c = payload.agentId) !== null && _c !== void 0 ? _c : null,
                companyName: String(payload.companyName).trim(),
                email: String(payload.email).trim(),
                logoUrl: (_d = payload.logoUrl) !== null && _d !== void 0 ? _d : null,
                companyType,
                phoneNumbers,
                registrationNumber: payload.registrationNumber
                    ? String(payload.registrationNumber).trim()
                    : null,
                tin: payload.tin ? String(payload.tin).trim() : null,
                incorporationDate: (_e = parseDate(payload.incorporationDate)) !== null && _e !== void 0 ? _e : null,
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
                constitutionUrl: (_f = payload.constitutionUrl) !== null && _f !== void 0 ? _f : null,
                tradingLicenseUrl: (_g = payload.tradingLicenseUrl) !== null && _g !== void 0 ? _g : null,
                bankStatementUrl: String(payload.bankStatementUrl),
                tinCertificateUrl: (_h = payload.tinCertificateUrl) !== null && _h !== void 0 ? _h : null,
                logoDocUrl: (_j = payload.logoDocUrl) !== null && _j !== void 0 ? _j : null,
                formA1Url: (_k = payload.formA1Url) !== null && _k !== void 0 ? _k : null,
                formS18Url: (_l = payload.formS18Url) !== null && _l !== void 0 ? _l : null,
                form18Url: (_m = payload.form18Url) !== null && _m !== void 0 ? _m : null,
                form20Url: (_o = payload.form20Url) !== null && _o !== void 0 ? _o : null,
                beneficialOwnershipFormUrl: (_p = payload.beneficialOwnershipFormUrl) !== null && _p !== void 0 ? _p : null,
                memorandumArticlesUrl: (_q = payload.memorandumArticlesUrl) !== null && _q !== void 0 ? _q : null,
                officialAccountUrl: (_r = payload.officialAccountUrl) !== null && _r !== void 0 ? _r : null,
                isApproved: false,
            };
            const saved = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const record = yield tx.companyOnboarding.upsert({
                    where: { userId },
                    update: onboardingData,
                    create: onboardingData,
                });
                yield tx.companyDirector.deleteMany({ where: { companyOnboardingId: record.id } });
                yield tx.companyDirector.createMany({
                    data: rawDirectors.map((d) => {
                        var _a, _b;
                        return ({
                            companyOnboardingId: record.id,
                            fullName: String(d.fullName).trim(),
                            email: d.email ? String(d.email) : null,
                            phone: d.phone ? String(d.phone) : null,
                            address: d.address ? String(d.address) : null,
                            dateOfBirth: (_a = parseDate(d.dateOfBirth)) !== null && _a !== void 0 ? _a : undefined,
                            ninOrPassportNumber: d.ninOrPassportNumber
                                ? String(d.ninOrPassportNumber)
                                : null,
                            documentUrl: (_b = d.documentUrl) !== null && _b !== void 0 ? _b : null,
                        });
                    }),
                });
                yield tx.companyUBO.deleteMany({ where: { companyOnboardingId: record.id } });
                if (rawUBOs.length > 0) {
                    yield tx.companyUBO.createMany({
                        data: rawUBOs.map((u) => {
                            var _a, _b;
                            const ownershipType = parseOwnershipType(u.ownershipType);
                            return {
                                companyOnboardingId: record.id,
                                fullName: String(u.fullName).trim(),
                                email: u.email ? String(u.email) : null,
                                phone: u.phone ? String(u.phone) : null,
                                address: u.address ? String(u.address) : null,
                                dateOfBirth: (_a = parseDate(u.dateOfBirth)) !== null && _a !== void 0 ? _a : undefined,
                                ninOrPassportNumber: u.ninOrPassportNumber
                                    ? String(u.ninOrPassportNumber)
                                    : null,
                                ownershipType,
                                ownershipTypeOther: ownershipType === "OTHER"
                                    ? String(u.ownershipTypeOther)
                                    : null,
                                documentUrl: (_b = u.documentUrl) !== null && _b !== void 0 ? _b : null,
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
            }));
            return res.status(200).json({ ok: true, data: saved });
        }
        catch (e) {
            console.error("submitCompanyOnboarding error:", e);
            return res.status(500).json({ error: "Failed to submit company onboarding." });
        }
    });
}
function getMyCompanyOnboarding(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const record = yield db_1.db.companyOnboarding.findUnique({
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
        }
        catch (e) {
            console.error("getMyCompanyOnboarding error:", e);
            return res.status(500).json({ error: "Failed to load company onboarding." });
        }
    });
}
function updateCompanyDirectors(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const existing = yield db_1.db.companyOnboarding.findUnique({
                where: { userId },
                select: { id: true },
            });
            if (!existing) {
                return res.status(404).json({
                    error: "Company onboarding not found. Submit the main form first.",
                });
            }
            const rawDirectors = Array.isArray(req.body.directors)
                ? req.body.directors
                : [];
            if (rawDirectors.length === 0) {
                return res.status(400).json({ error: "At least one director is required." });
            }
            for (let i = 0; i < rawDirectors.length; i++) {
                if (!((_a = rawDirectors[i].fullName) === null || _a === void 0 ? void 0 : _a.trim())) {
                    return res
                        .status(400)
                        .json({ error: `Director #${i + 1}: fullName is required.` });
                }
            }
            yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.companyDirector.deleteMany({
                    where: { companyOnboardingId: existing.id },
                });
                yield tx.companyDirector.createMany({
                    data: rawDirectors.map((d) => {
                        var _a, _b;
                        return ({
                            companyOnboardingId: existing.id,
                            fullName: String(d.fullName).trim(),
                            email: d.email ? String(d.email) : null,
                            phone: d.phone ? String(d.phone) : null,
                            address: d.address ? String(d.address) : null,
                            dateOfBirth: (_a = parseDate(d.dateOfBirth)) !== null && _a !== void 0 ? _a : undefined,
                            ninOrPassportNumber: d.ninOrPassportNumber
                                ? String(d.ninOrPassportNumber)
                                : null,
                            documentUrl: (_b = d.documentUrl) !== null && _b !== void 0 ? _b : null,
                        });
                    }),
                });
            }));
            const updated = yield db_1.db.companyDirector.findMany({
                where: { companyOnboardingId: existing.id },
            });
            return res.status(200).json({ ok: true, data: updated });
        }
        catch (e) {
            console.error("updateCompanyDirectors error:", e);
            return res.status(500).json({ error: "Failed to update directors." });
        }
    });
}
function getCompanyDirectors(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const record = yield db_1.db.companyOnboarding.findUnique({
                where: { userId },
                select: { id: true },
            });
            if (!record)
                return res.status(404).json({ error: "Company onboarding not found." });
            const directors = yield db_1.db.companyDirector.findMany({
                where: { companyOnboardingId: record.id },
            });
            return res.status(200).json({ ok: true, data: directors });
        }
        catch (e) {
            console.error("getCompanyDirectors error:", e);
            return res.status(500).json({ error: "Failed to load directors." });
        }
    });
}
function updateCompanyUBOs(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const existing = yield db_1.db.companyOnboarding.findUnique({
                where: { userId },
                select: { id: true },
            });
            if (!existing) {
                return res.status(404).json({
                    error: "Company onboarding not found. Submit the main form first.",
                });
            }
            const rawUBOs = Array.isArray(req.body.ubos) ? req.body.ubos : [];
            for (let i = 0; i < rawUBOs.length; i++) {
                const u = rawUBOs[i];
                if (!((_a = u.fullName) === null || _a === void 0 ? void 0 : _a.trim())) {
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
            yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.companyUBO.deleteMany({
                    where: { companyOnboardingId: existing.id },
                });
                if (rawUBOs.length > 0) {
                    yield tx.companyUBO.createMany({
                        data: rawUBOs.map((u) => {
                            var _a, _b;
                            const ownershipType = parseOwnershipType(u.ownershipType);
                            return {
                                companyOnboardingId: existing.id,
                                fullName: String(u.fullName).trim(),
                                email: u.email ? String(u.email) : null,
                                phone: u.phone ? String(u.phone) : null,
                                address: u.address ? String(u.address) : null,
                                dateOfBirth: (_a = parseDate(u.dateOfBirth)) !== null && _a !== void 0 ? _a : undefined,
                                ninOrPassportNumber: u.ninOrPassportNumber
                                    ? String(u.ninOrPassportNumber)
                                    : null,
                                ownershipType,
                                ownershipTypeOther: ownershipType === "OTHER" ? String(u.ownershipTypeOther) : null,
                                documentUrl: (_b = u.documentUrl) !== null && _b !== void 0 ? _b : null,
                            };
                        }),
                    });
                }
            }));
            const updated = yield db_1.db.companyUBO.findMany({
                where: { companyOnboardingId: existing.id },
            });
            return res.status(200).json({ ok: true, data: updated });
        }
        catch (e) {
            console.error("updateCompanyUBOs error:", e);
            return res.status(500).json({ error: "Failed to update UBOs." });
        }
    });
}
function getCompanyUBOs(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const record = yield db_1.db.companyOnboarding.findUnique({
                where: { userId },
                select: { id: true },
            });
            if (!record)
                return res.status(404).json({ error: "Company onboarding not found." });
            const ubos = yield db_1.db.companyUBO.findMany({
                where: { companyOnboardingId: record.id },
            });
            return res.status(200).json({ ok: true, data: ubos });
        }
        catch (e) {
            console.error("getCompanyUBOs error:", e);
            return res.status(500).json({ error: "Failed to load UBOs." });
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
                    where: {
                        tin: String(tin),
                        NOT: callerId ? { userId: callerId } : undefined,
                    },
                    select: { id: true },
                }),
                db_1.db.companyOnboarding.findFirst({
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
        }
        catch (e) {
            console.error("validateTin error:", e);
            return res.status(500).json({ error: "Failed to validate TIN." });
        }
    });
}
