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
exports.submitCompanyOnboarding = submitCompanyOnboarding;
exports.getMyCompanyOnboarding = getMyCompanyOnboarding;
exports.updateCompanyDirectors = updateCompanyDirectors;
exports.updateCompanyUBOs = updateCompanyUBOs;
exports.getCompanyDirectors = getCompanyDirectors;
exports.getCompanyUBOs = getCompanyUBOs;
exports.approveCompanyOnboarding = approveCompanyOnboarding;
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
    const key = String(v || "").toUpperCase().replace(/\s+/g, "_");
    return (_a = map[key]) !== null && _a !== void 0 ? _a : "LIMITED";
}
function parseOwnershipType(v) {
    var _a;
    const map = {
        OWNERSHIP_BY_SENIOR: "OWNERSHIP_BY_SENIOR",
        MANAGEMENT_OFFICIAL: "MANAGEMENT_OFFICIAL",
        OTHER: "OTHER",
    };
    const key = String(v || "").toUpperCase().replace(/\s+/g, "_");
    return (_a = map[key]) !== null && _a !== void 0 ? _a : "OTHER";
}
function submitCompanyOnboarding(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const payload = req.body;
            const missing = requireFields(payload, ["companyName", "email", "companyType"]);
            if (missing.length) {
                return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
            }
            const phoneNumbers = Array.isArray(payload.phoneNumbers)
                ? payload.phoneNumbers.map(String).filter(Boolean)
                : [];
            if (phoneNumbers.length === 0) {
                return res.status(400).json({ error: "At least one official phone number is required." });
            }
            const sanctionsOrLegal = String(payload.sanctionsOrLegal || "").trim().toLowerCase();
            if (sanctionsOrLegal === "yes") {
                return res.status(400).json({ error: "Cannot open account due to sanctions/legal history." });
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
                    where: { registrationNumber: String(payload.registrationNumber), NOT: { userId } },
                    select: { id: true },
                });
                if (regConflict) {
                    return res.status(409).json({ error: "Registration number is already in use." });
                }
            }
            const rawDirectors = Array.isArray(payload.directors) ? payload.directors : [];
            if (rawDirectors.length === 0) {
                return res.status(400).json({ error: "At least one company director is required." });
            }
            for (let i = 0; i < rawDirectors.length; i++) {
                const d = rawDirectors[i];
                if (!d.fullName || String(d.fullName).trim() === "") {
                    return res.status(400).json({ error: `Director #${i + 1}: fullName is required.` });
                }
            }
            const rawUBOs = Array.isArray(payload.ubos) ? payload.ubos : [];
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
            const onboardingData = {
                userId,
                agentId: (_a = payload.agentId) !== null && _a !== void 0 ? _a : null,
                companyName: String(payload.companyName).trim(),
                email: String(payload.email).trim(),
                logoUrl: (_b = payload.logoUrl) !== null && _b !== void 0 ? _b : null,
                companyType,
                phoneNumbers,
                registrationNumber: payload.registrationNumber ? String(payload.registrationNumber).trim() : null,
                tin: payload.tin ? String(payload.tin).trim() : null,
                incorporationDate: (_c = parseDate(payload.incorporationDate)) !== null && _c !== void 0 ? _c : null,
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
                constitutionUrl: (_d = payload.constitutionUrl) !== null && _d !== void 0 ? _d : null,
                tradingLicenseUrl: (_e = payload.tradingLicenseUrl) !== null && _e !== void 0 ? _e : null,
                bankStatementUrl: String(payload.bankStatementUrl),
                tinCertificateUrl: (_f = payload.tinCertificateUrl) !== null && _f !== void 0 ? _f : null,
                logoDocUrl: (_g = payload.logoDocUrl) !== null && _g !== void 0 ? _g : null,
                formA1Url: (_h = payload.formA1Url) !== null && _h !== void 0 ? _h : null,
                formS18Url: (_j = payload.formS18Url) !== null && _j !== void 0 ? _j : null,
                form18Url: (_k = payload.form18Url) !== null && _k !== void 0 ? _k : null,
                form20Url: (_l = payload.form20Url) !== null && _l !== void 0 ? _l : null,
                beneficialOwnershipFormUrl: (_m = payload.beneficialOwnershipFormUrl) !== null && _m !== void 0 ? _m : null,
                memorandumArticlesUrl: (_o = payload.memorandumArticlesUrl) !== null && _o !== void 0 ? _o : null,
                officialAccountUrl: (_p = payload.officialAccountUrl) !== null && _p !== void 0 ? _p : null,
                isApproved: false,
            };
            const saved = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const record = yield tx.companyOnboarding.upsert({
                    where: { userId },
                    update: onboardingData,
                    create: onboardingData,
                });
                yield tx.companyDirector.deleteMany({ where: { companyOnboardingId: record.id } });
                if (rawDirectors.length > 0) {
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
                                ninOrPassportNumber: d.ninOrPassportNumber ? String(d.ninOrPassportNumber) : null,
                                documentUrl: (_b = d.documentUrl) !== null && _b !== void 0 ? _b : null,
                            });
                        }),
                    });
                }
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
                                ninOrPassportNumber: u.ninOrPassportNumber ? String(u.ninOrPassportNumber) : null,
                                ownershipType,
                                ownershipTypeOther: ownershipType === "OTHER" ? String(u.ownershipTypeOther) : null,
                                documentUrl: (_b = u.documentUrl) !== null && _b !== void 0 ? _b : null,
                            };
                        }),
                    });
                }
                return record.id;
            }), { timeout: 30000 });
            const result = yield db_1.db.companyOnboarding.findUnique({
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
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const existing = yield db_1.db.companyOnboarding.findUnique({
                where: { userId },
                select: { id: true },
            });
            if (!existing) {
                return res.status(404).json({ error: "Company onboarding record not found. Submit the main form first." });
            }
            const rawDirectors = Array.isArray(req.body.directors) ? req.body.directors : [];
            if (rawDirectors.length === 0) {
                return res.status(400).json({ error: "At least one director is required." });
            }
            for (let i = 0; i < rawDirectors.length; i++) {
                if (!rawDirectors[i].fullName || String(rawDirectors[i].fullName).trim() === "") {
                    return res.status(400).json({ error: `Director #${i + 1}: fullName is required.` });
                }
            }
            yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.companyDirector.deleteMany({ where: { companyOnboardingId: existing.id } });
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
                            ninOrPassportNumber: d.ninOrPassportNumber ? String(d.ninOrPassportNumber) : null,
                            documentUrl: (_b = d.documentUrl) !== null && _b !== void 0 ? _b : null,
                        });
                    }),
                });
            }));
            const updated = yield db_1.db.companyDirector.findMany({ where: { companyOnboardingId: existing.id } });
            return res.status(200).json({ ok: true, data: updated });
        }
        catch (e) {
            console.error("updateCompanyDirectors error:", e);
            return res.status(500).json({ error: "Failed to update directors." });
        }
    });
}
function updateCompanyUBOs(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Not authenticated (userId missing)." });
            const existing = yield db_1.db.companyOnboarding.findUnique({
                where: { userId },
                select: { id: true },
            });
            if (!existing) {
                return res.status(404).json({ error: "Company onboarding record not found. Submit the main form first." });
            }
            const rawUBOs = Array.isArray(req.body.ubos) ? req.body.ubos : [];
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
            yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                yield tx.companyUBO.deleteMany({ where: { companyOnboardingId: existing.id } });
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
                                ninOrPassportNumber: u.ninOrPassportNumber ? String(u.ninOrPassportNumber) : null,
                                ownershipType,
                                ownershipTypeOther: ownershipType === "OTHER" ? String(u.ownershipTypeOther) : null,
                                documentUrl: (_b = u.documentUrl) !== null && _b !== void 0 ? _b : null,
                            };
                        }),
                    });
                }
            }));
            const updated = yield db_1.db.companyUBO.findMany({ where: { companyOnboardingId: existing.id } });
            return res.status(200).json({ ok: true, data: updated });
        }
        catch (e) {
            console.error("updateCompanyUBOs error:", e);
            return res.status(500).json({ error: "Failed to update UBOs." });
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
            const ubos = yield db_1.db.companyUBO.findMany({ where: { companyOnboardingId: record.id } });
            return res.status(200).json({ ok: true, data: ubos });
        }
        catch (e) {
            console.error("getCompanyUBOs error:", e);
            return res.status(500).json({ error: "Failed to load UBOs." });
        }
    });
}
function approveCompanyOnboarding(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            const record = yield db_1.db.companyOnboarding.findUnique({ where: { id }, select: { id: true } });
            if (!record)
                return res.status(404).json({ error: "Company onboarding record not found." });
            const updated = yield db_1.db.companyOnboarding.update({
                where: { id },
                data: { isApproved: true },
                select: { id: true, userId: true, isApproved: true, updatedAt: true },
            });
            return res.status(200).json({ ok: true, data: updated });
        }
        catch (e) {
            console.error("approveCompanyOnboarding error:", e);
            return res.status(500).json({ error: "Failed to approve onboarding." });
        }
    });
}
