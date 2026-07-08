"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = createUser;
exports.loginUser = loginUser;
exports.getAllUsers = getAllUsers;
exports.getCurrentUser = getCurrentUser;
exports.getUserById = getUserById;
exports.updateSignedAgreementUrl = updateSignedAgreementUrl;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.downloadActivityLogsPdf = downloadActivityLogsPdf;
const db_1 = require("../db/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importStar(require("crypto"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const tokens_1 = require("../utils/tokens");
const userAgentParser_1 = require("../utils/userAgentParser");
const geoLocation_1 = require("../utils/geoLocation");
const client_1 = require("@prisma/client");
const mailer_1 = require("../lib/mailer");
const recaptcha_1 = require("../utils/recaptcha");
function generateAccountNumber() {
    return `GK${(0, crypto_1.randomInt)(1000000, 10000000)}`;
}
const isValidRole = (v) => Object.values(client_1.UserRole).includes(v);
const isValidStatus = (v) => Object.values(client_1.UserStatus).includes(v);
const makeSixDigitToken = () => String(crypto_1.default.randomInt(0, 1000000)).padStart(6, "0");
const userPortfolioSelect = {
    id: true,
    customName: true,
    portfolioValue: true,
    totalInvested: true,
    totalLossGain: true,
    isActive: true,
    portfolio: true,
    wallet: {
        select: {
            id: true,
            accountNumber: true,
            balance: true,
            netAssetValue: true,
            totalFees: true,
            bankFee: true,
            transactionFee: true,
            feeAtBank: true,
            status: true,
        },
    },
    userAssets: {
        select: {
            id: true,
            allocationPercentage: true,
            costPerShare: true,
            costPrice: true,
            stock: true,
            closeValue: true,
            lossGain: true,
            asset: true,
        },
    },
};
const userDetailSelect = {
    id: true,
    firstName: true,
    lastName: true,
    name: true,
    email: true,
    phone: true,
    emailVerified: true,
    status: true,
    isApproved: true,
    imageUrl: true,
    role: true,
    createdAt: true,
    updatedAt: true,
    individualOnboarding: {
        select: {
            id: true,
            fullName: true,
            isApproved: true,
            createdAt: true,
            dateOfBirth: true,
            tin: true,
            homeAddress: true,
            employmentStatus: true,
            occupation: true,
            companyName: true,
            primaryGoal: true,
            timeHorizon: true,
            riskTolerance: true,
            investmentExperience: true,
            sourceOfIncome: true,
            expectedInvestment: true,
            isPEP: true,
            consentToDataCollection: true,
            agreeToTerms: true,
            nationalIdUrl: true,
            passportPhotoUrl: true,
            tinCertificateUrl: true,
            bankStatementUrl: true,
        },
    },
    companyOnboarding: {
        select: {
            id: true,
            companyName: true,
            companyType: true,
            isApproved: true,
            createdAt: true,
        },
    },
    masterWallet: {
        select: {
            id: true,
            accountNumber: true,
            balance: true,
            totalDeposited: true,
            totalWithdrawn: true,
            totalFees: true,
            netAssetValue: true,
            status: true,
            updatedAt: true,
        },
    },
    deposits: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
            id: true,
            amount: true,
            transactionStatus: true,
            depositTarget: true,
            userPortfolioId: true,
            transactionId: true,
            referenceNo: true,
            mobileNo: true,
            accountNo: true,
            method: true,
            description: true,
            createdByName: true,
            approvedByName: true,
            approvedAt: true,
            rejectedByName: true,
            rejectedAt: true,
            rejectReason: true,
            createdAt: true,
            bankCost: true,
            transactionCost: true,
            cashAtBank: true,
        },
    },
    withdrawals: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
            id: true,
            amount: true,
            transactionStatus: true,
            userPortfolioId: true,
            withdrawalType: true,
            transactionId: true,
            referenceNo: true,
            accountNo: true,
            accountName: true,
            method: true,
            bankName: true,
            bankAccountName: true,
            bankBranch: true,
            description: true,
            createdByName: true,
            approvedByName: true,
            approvedAt: true,
            rejectedByName: true,
            rejectedAt: true,
            rejectReason: true,
            createdAt: true,
        },
    },
    userPortfolios: { select: userPortfolioSelect },
};
function createUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const { email, phone, password, firstName, lastName, imageUrl, role, status, recaptchaToken, website, entityType, } = req.body;
        try {
            if (website === null || website === void 0 ? void 0 : website.trim()) {
                console.log("🍯 Honeypot triggered:", { email, ip: req.ip, ua: req.headers["user-agent"] });
                return res.status(201).json({
                    success: true, data: null,
                    message: "Account created successfully. Please check your email for the verification code.",
                    errors: {},
                });
            }
            if (!(recaptchaToken === null || recaptchaToken === void 0 ? void 0 : recaptchaToken.trim())) {
                return res.status(400).json({
                    success: false, data: null,
                    message: "reCAPTCHA verification is required",
                    errors: { recaptcha: "Please complete the reCAPTCHA verification" },
                });
            }
            const recaptchaResult = yield (0, recaptcha_1.verifyRecaptcha)(recaptchaToken);
            if (!recaptchaResult.success) {
                return res.status(400).json({
                    success: false, data: null,
                    message: recaptchaResult.error || "reCAPTCHA verification failed",
                    errors: { recaptcha: recaptchaResult.error || "Verification failed. Please try again." },
                });
            }
            if (!email || !phone || !password || !firstName) {
                return res.status(400).json({
                    success: false, data: null,
                    message: "Missing required fields.",
                    errors: {},
                });
            }
            const emailNorm = email.trim().toLowerCase();
            const phoneNorm = phone.trim();
            const roleValue = isValidRole(role) ? role : client_1.UserRole.USER;
            const statusValue = isValidStatus(status) ? status : client_1.UserStatus.PENDING;
            const displayName = (lastName === null || lastName === void 0 ? void 0 : lastName.trim())
                ? `${firstName.trim()} ${lastName.trim()}`
                : firstName.trim();
            const [existingEmail, existingPhone] = yield Promise.all([
                db_1.db.user.findUnique({ where: { email: emailNorm }, select: { id: true } }),
                db_1.db.user.findUnique({ where: { phone: phoneNorm }, select: { id: true } }),
            ]);
            if (existingEmail && existingPhone) {
                return res.status(409).json({
                    success: false, data: null,
                    message: "Account already exists.",
                    errors: { email: "Email already registered", phone: "Phone already registered" },
                });
            }
            if (existingEmail) {
                return res.status(409).json({
                    success: false, data: null,
                    message: "Email address is already registered.",
                    errors: { email: "Email address is already registered" },
                });
            }
            if (existingPhone) {
                return res.status(409).json({
                    success: false, data: null,
                    message: "Phone number is already registered.",
                    errors: { phone: "Phone number is already registered" },
                });
            }
            const hashedPassword = yield bcryptjs_1.default.hash(password, 12);
            const verificationCode = makeSixDigitToken();
            const totalFees = 0;
            let newUser;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    newUser = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                        const accountNumber = generateAccountNumber();
                        const user = yield tx.user.create({
                            data: {
                                email: emailNorm,
                                phone: phoneNorm,
                                firstName: firstName.trim(),
                                lastName: (lastName === null || lastName === void 0 ? void 0 : lastName.trim()) || "",
                                name: displayName,
                                imageUrl,
                                password: hashedPassword,
                                role: roleValue,
                                status: statusValue,
                                emailVerified: false,
                                isApproved: false,
                                token: verificationCode,
                                masterWallet: {
                                    create: {
                                        accountNumber,
                                        totalDeposited: 0,
                                        totalWithdrawn: 0,
                                        totalFees,
                                        netAssetValue: 0,
                                        status: "ACTIVE",
                                    },
                                },
                            },
                            select: {
                                id: true, firstName: true, lastName: true, name: true,
                                email: true, phone: true, imageUrl: true,
                                role: true, status: true, createdAt: true, updatedAt: true,
                            },
                        });
                        return user;
                    }));
                    break;
                }
                catch (err) {
                    if ((err === null || err === void 0 ? void 0 : err.code) === "P2002" && attempt < 2)
                        continue;
                    throw err;
                }
            }
            if (!newUser) {
                return res.status(500).json({
                    success: false, data: null,
                    message: "Failed to create user.",
                    errors: {},
                });
            }
            try {
                yield (0, mailer_1.sendVerificationCodeResend)({
                    to: newUser.email,
                    name: (_b = (_a = newUser.firstName) !== null && _a !== void 0 ? _a : newUser.name) !== null && _b !== void 0 ? _b : "there",
                    code: verificationCode,
                });
            }
            catch (emailError) {
                console.error("Error sending verification email:", emailError);
            }
            console.log("✅ User registered:", {
                userId: newUser.id,
                email: newUser.email,
                entityType: entityType !== null && entityType !== void 0 ? entityType : "individual",
                ip: req.ip,
            });
            return res.status(201).json({
                success: true, data: newUser,
                message: "Account created successfully. Please check your email for the verification code.",
                errors: {},
            });
        }
        catch (error) {
            console.error("Error creating user:", error);
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                const target = (_c = error === null || error === void 0 ? void 0 : error.meta) === null || _c === void 0 ? void 0 : _c.target;
                if ((target === null || target === void 0 ? void 0 : target.includes("email")) && (target === null || target === void 0 ? void 0 : target.includes("phone"))) {
                    return res.status(409).json({ success: false, data: null, message: "Account already exists.", errors: { email: "Email already registered", phone: "Phone already registered" } });
                }
                if (target === null || target === void 0 ? void 0 : target.includes("email")) {
                    return res.status(409).json({ success: false, data: null, message: "Email already registered.", errors: { email: "Email already registered" } });
                }
                if (target === null || target === void 0 ? void 0 : target.includes("phone")) {
                    return res.status(409).json({ success: false, data: null, message: "Phone already registered.", errors: { phone: "Phone already registered" } });
                }
                return res.status(409).json({ success: false, data: null, message: "Email or phone already in use", errors: {} });
            }
            return res.status(500).json({
                success: false, data: null,
                message: "Something went wrong. Please try again.",
                errors: {},
            });
        }
    });
}
function loginUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const { identifier, password } = req.body;
        try {
            if (!identifier || !password) {
                return res.status(400).json({ data: null, error: "Missing credentials" });
            }
            const idNorm = identifier.trim().toLowerCase();
            const user = yield db_1.db.user.findFirst({
                where: { OR: [{ email: idNorm }, { phone: identifier.trim() }] },
            });
            if (!user)
                return res.status(401).json({ data: null, error: "Invalid credentials" });
            if (user.status !== "ACTIVE")
                return res.status(403).json({ data: null, error: "User account is not active" });
            if (!user.password)
                return res.status(401).json({ data: null, error: "This account has no password. Use social login or reset password." });
            const ok = yield bcryptjs_1.default.compare(password, user.password);
            if (!ok)
                return res.status(401).json({ data: null, error: "Invalid credentials" });
            const payload = { userId: user.id, phone: user.phone, email: user.email, role: user.role };
            const accessToken = (0, tokens_1.generateAccessToken)(payload);
            const refreshToken = (0, tokens_1.generateRefreshToken)(payload);
            const auditCtx = req.auditContext;
            const ip = (_a = auditCtx === null || auditCtx === void 0 ? void 0 : auditCtx.ipAddress) !== null && _a !== void 0 ? _a : null;
            const ua = (_b = auditCtx === null || auditCtx === void 0 ? void 0 : auditCtx.userAgent) !== null && _b !== void 0 ? _b : null;
            const uaParsed = (0, userAgentParser_1.parseUserAgent)(ua);
            const geo = yield (0, geoLocation_1.lookupIp)(ip).catch(() => null);
            yield db_1.db.refreshToken.create({
                data: {
                    token: refreshToken,
                    userId: user.id,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    ipAddress: ip,
                    userAgent: ua,
                    location: (_c = geo === null || geo === void 0 ? void 0 : geo.location) !== null && _c !== void 0 ? _c : null,
                    country: (_d = geo === null || geo === void 0 ? void 0 : geo.country) !== null && _d !== void 0 ? _d : null,
                    city: (_e = geo === null || geo === void 0 ? void 0 : geo.city) !== null && _e !== void 0 ? _e : null,
                    deviceType: uaParsed.deviceType,
                    browser: uaParsed.browser,
                    os: uaParsed.os,
                },
            });
            const { password: _pw } = user, safe = __rest(user, ["password"]);
            return res.status(200).json({ data: { user: safe, accessToken, refreshToken }, error: null });
        }
        catch (error) {
            console.error("Login error:", error);
            return res.status(500).json({ data: null, error: "An error occurred during login" });
        }
    });
}
function getAllUsers(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { role } = req.query;
            const where = role && isValidRole(role) ? { role: role } : {};
            const users = yield db_1.db.user.findMany({
                where,
                orderBy: { createdAt: "desc" },
                select: Object.assign(Object.assign({}, userDetailSelect), { accounts: true, activityLogs: { orderBy: { createdAt: "desc" }, take: 20 } }),
            });
            return res.status(200).json({ data: users, error: null });
        }
        catch (error) {
            console.error("Error fetching users:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch users" });
        }
    });
}
function getCurrentUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
                return res.status(401).json({ data: null, error: "Unauthorized" });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: req.user.userId },
                select: userDetailSelect,
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            return res.status(200).json({ data: user, error: null });
        }
        catch (error) {
            console.error("Error fetching current user:", error);
            return res.status(500).json({ data: null, error: "Server error" });
        }
    });
}
function getUserById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            const user = yield db_1.db.user.findUnique({
                where: { id },
                select: Object.assign(Object.assign({}, userDetailSelect), { individualOnboarding: {
                        include: {
                            beneficiaries: true,
                            nextOfKin: true,
                        },
                    }, companyOnboarding: {
                        include: {
                            directors: true,
                            ubos: true,
                        },
                    }, signature: {
                        select: {
                            signatureType: true,
                            imageUrl: true,
                            typedName: true,
                            signedAt: true,
                        },
                    } }),
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            return res.status(200).json({ data: user, error: null });
        }
        catch (error) {
            console.error("Error fetching user by id:", error);
            return res.status(500).json({ data: null, error: "Server error" });
        }
    });
}
function updateSignedAgreementUrl(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        const { signedAgreementUrl } = req.body;
        if (!signedAgreementUrl) {
            return res.status(400).json({ error: "signedAgreementUrl is required" });
        }
        try {
            const updated = yield db_1.db.individualOnboarding.updateMany({
                where: { userId: id },
                data: { signedAgreementUrl },
            });
            if (updated.count === 0) {
                return res.status(404).json({ error: "No individual onboarding found for this user" });
            }
            return res.status(200).json({ ok: true });
        }
        catch (error) {
            console.error("updateSignedAgreementUrl error:", error);
            return res.status(500).json({ error: "Failed to update signed agreement URL" });
        }
    });
}
function updateUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const { id } = req.params;
        const { firstName, lastName, email, phone, role, status, password, imageUrl, emailVerified, isApproved, } = req.body;
        try {
            const existingUser = yield db_1.db.user.findUnique({ where: { id } });
            if (!existingUser)
                return res.status(404).json({ data: null, error: "User not found" });
            if (email || phone) {
                const conflict = yield db_1.db.user.findFirst({
                    where: {
                        OR: [
                            { email: email === null || email === void 0 ? void 0 : email.trim().toLowerCase() },
                            { phone: phone === null || phone === void 0 ? void 0 : phone.trim() },
                        ],
                        NOT: { id },
                    },
                    select: { id: true },
                });
                if (conflict) {
                    return res.status(409).json({ data: null, error: "Email or phone already in use by another user" });
                }
            }
            const roleValue = isValidRole(role) ? role : existingUser.role;
            const statusValue = isValidStatus(status) ? status : existingUser.status;
            const hashedPassword = password ? yield bcryptjs_1.default.hash(password, 12) : undefined;
            const nextFirst = (_a = firstName === null || firstName === void 0 ? void 0 : firstName.trim()) !== null && _a !== void 0 ? _a : existingUser.firstName;
            const nextLast = lastName !== undefined
                ? ((_b = lastName === null || lastName === void 0 ? void 0 : lastName.trim()) !== null && _b !== void 0 ? _b : "")
                : ((_c = existingUser.lastName) !== null && _c !== void 0 ? _c : "");
            const nextName = nextLast
                ? `${nextFirst} ${nextLast}`.trim()
                : nextFirst;
            const updatedUser = yield db_1.db.user.update({
                where: { id },
                data: {
                    firstName: nextFirst,
                    lastName: nextLast,
                    name: nextName,
                    email: email ? email.trim().toLowerCase() : existingUser.email,
                    phone: phone ? phone.trim() : existingUser.phone,
                    role: roleValue,
                    status: statusValue,
                    password: hashedPassword !== null && hashedPassword !== void 0 ? hashedPassword : existingUser.password,
                    imageUrl: imageUrl !== null && imageUrl !== void 0 ? imageUrl : existingUser.imageUrl,
                    emailVerified: emailVerified !== null && emailVerified !== void 0 ? emailVerified : existingUser.emailVerified,
                    isApproved: isApproved !== null && isApproved !== void 0 ? isApproved : existingUser.isApproved,
                },
                select: {
                    id: true, firstName: true, lastName: true, name: true,
                    email: true, phone: true, role: true, status: true,
                    imageUrl: true, emailVerified: true, isApproved: true,
                    createdAt: true, updatedAt: true,
                },
            });
            if (isApproved === true && !existingUser.isApproved) {
                yield db_1.db.individualOnboarding.updateMany({
                    where: { userId: id },
                    data: { isApproved: true },
                }).catch(() => { });
                yield db_1.db.companyOnboarding.updateMany({
                    where: { userId: id },
                    data: { isApproved: true },
                }).catch(() => { });
                try {
                    yield (0, mailer_1.sendAccountVerifiedEmail)({
                        to: updatedUser.email,
                        name: (_e = (_d = updatedUser.firstName) !== null && _d !== void 0 ? _d : updatedUser.name) !== null && _e !== void 0 ? _e : "there",
                    });
                }
                catch (emailError) {
                    console.error("updateUser: failed to send approval email:", emailError);
                }
            }
            return res.status(200).json({ data: updatedUser, error: null });
        }
        catch (error) {
            console.error("Error updating user:", error);
            return res.status(500).json({ data: null, error: "Failed to update user" });
        }
    });
}
function deleteUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            const existingUser = yield db_1.db.user.findUnique({ where: { id } });
            if (!existingUser)
                return res.status(404).json({ data: null, error: "User not found" });
            yield db_1.db.user.delete({ where: { id } });
            return res.status(200).json({ data: null, message: "User deleted successfully" });
        }
        catch (error) {
            console.error("Error deleting user:", error);
            return res.status(500).json({ data: null, error: "Failed to delete user" });
        }
    });
}
const PDF_NAVY = "#1B3A6B";
const PDF_BLUE = "#2E6DA4";
const PDF_ROW_A = "#F0F4FA";
const PDF_BORDER = "#D0D8E8";
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_H - 44;
function pdfFmtDate(d) {
    return d.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }) + " UTC";
}
function pdfTrunc(s, max) {
    if (!s)
        return "-";
    return s.length > max ? s.slice(0, max - 1) + "." : s;
}
function drawActivityFooter(doc, pageNum, generatedDate) {
    const fy = PAGE_H - 30;
    doc.moveTo(MARGIN, fy).lineTo(PAGE_W - MARGIN, fy).lineWidth(0.4).stroke(PDF_BORDER);
    doc.fillColor("#888888").font("Helvetica").fontSize(7)
        .text(`GoldKach Investment Ltd  -  Confidential  -  Generated ${generatedDate}`, MARGIN, fy + 5, { width: CONTENT_W - 60, lineBreak: false });
    doc.text(`Page ${pageNum}`, PAGE_W - MARGIN - 50, fy + 5, {
        width: 50, align: "right", lineBreak: false,
    });
}
function drawTableHeader(doc, colX, colW, y, rowH) {
    doc.rect(MARGIN, y, CONTENT_W, rowH).fill(PDF_NAVY);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7);
    doc.text("DATE (UTC)", colX.date + 3, y + 5, { width: colW.date - 4, lineBreak: false });
    doc.text("ACTION", colX.action + 3, y + 5, { width: colW.action - 4, lineBreak: false });
    doc.text("MODULE", colX.module + 3, y + 5, { width: colW.module - 4, lineBreak: false });
    doc.text("STATUS", colX.status + 3, y + 5, { width: colW.status - 4, lineBreak: false });
    doc.text("IP ADDRESS", colX.ip + 3, y + 5, { width: colW.ip - 4, lineBreak: false });
    doc.text("DESCRIPTION", colX.desc + 3, y + 5, { width: colW.desc - 4, lineBreak: false });
    return y + rowH;
}
function downloadActivityLogsPdf(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const { userId } = req.params;
        const { startDate, endDate, limit: limitParam, } = req.query;
        try {
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: {
                    id: true, firstName: true, lastName: true, email: true, role: true,
                    masterWallet: { select: { accountNumber: true } },
                },
            });
            if (!user)
                return res.status(404).json({ error: "User not found" });
            const limit = Math.min(Number(limitParam) || 500, 2000);
            const dateFilter = {};
            if (startDate)
                dateFilter.gte = new Date(startDate);
            if (endDate)
                dateFilter.lte = new Date(endDate);
            const logs = yield db_1.db.activityLog.findMany({
                where: Object.assign({ userId }, (Object.keys(dateFilter).length ? { createdAt: dateFilter } : {})),
                orderBy: { createdAt: "desc" },
                take: limit,
            });
            const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
            const generatedAt = new Date();
            const genDateStr = generatedAt.toISOString().slice(0, 10);
            const dateRange = startDate || endDate
                ? `${startDate !== null && startDate !== void 0 ? startDate : "-"} to ${endDate !== null && endDate !== void 0 ? endDate : "-"}`
                : "All time";
            const doc = new pdfkit_1.default({ size: "A4", margin: MARGIN, autoFirstPage: true });
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="activity-log-${displayName.replace(/\s+/g, "-")}-${genDateStr}.pdf"`);
            doc.pipe(res);
            doc.rect(0, 0, PAGE_W, 68).fill(PDF_NAVY);
            doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(15)
                .text("GOLDKACH INVESTMENT", MARGIN, 16, { width: 280, lineBreak: false });
            doc.fillColor("#AAC4E8").font("Helvetica").fontSize(8)
                .text("Unlocking Global Investments", MARGIN, 34, { lineBreak: false });
            doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(12)
                .text("User Activity Log", PAGE_W - MARGIN - 160, 18, { width: 160, align: "right", lineBreak: false });
            doc.fillColor("#AAC4E8").font("Helvetica").fontSize(7)
                .text(`Generated: ${pdfFmtDate(generatedAt)}`, PAGE_W - MARGIN - 160, 34, {
                width: 160, align: "right", lineBreak: false,
            });
            let y = 84;
            const infoH = 68;
            doc.rect(MARGIN, y, CONTENT_W, infoH).fill("#F7F9FC");
            doc.rect(MARGIN, y, CONTENT_W, infoH).lineWidth(0.5).stroke(PDF_BORDER);
            doc.fillColor(PDF_NAVY).font("Helvetica-Bold").fontSize(8)
                .text("CLIENT INFORMATION", MARGIN + 10, y + 8, { lineBreak: false });
            const c1 = MARGIN + 10, c2 = MARGIN + 185, c3 = MARGIN + 370;
            const r1y = y + 22, r2y = y + 46;
            const infoCell = (label, val, x, iy) => {
                doc.fillColor("#777777").font("Helvetica").fontSize(6.5)
                    .text(label, x, iy, { lineBreak: false });
                doc.fillColor("#111111").font("Helvetica-Bold").fontSize(8.5)
                    .text(val, x, iy + 9, { width: 170, lineBreak: false });
            };
            infoCell("CLIENT NAME", displayName, c1, r1y);
            infoCell("EMAIL", user.email, c2, r1y);
            infoCell("ACCOUNT NO.", (_b = (_a = user.masterWallet) === null || _a === void 0 ? void 0 : _a.accountNumber) !== null && _b !== void 0 ? _b : "-", c3, r1y);
            infoCell("DATE RANGE", dateRange, c1, r2y);
            infoCell("ROLE", user.role, c2, r2y);
            infoCell("TOTAL ENTRIES", String(logs.length), c3, r2y);
            y += infoH + 6;
            const successCount = logs.filter(l => { var _a; return ((_a = l.status) !== null && _a !== void 0 ? _a : "").toUpperCase() === "SUCCESS"; }).length;
            const failCount = logs.filter(l => { var _a; return ["FAILED", "ERROR"].includes(((_a = l.status) !== null && _a !== void 0 ? _a : "").toUpperCase()); }).length;
            const otherCount = logs.length - successCount - failCount;
            doc.rect(MARGIN, y, CONTENT_W, 26).fill(PDF_BLUE);
            doc.fillColor("#FFFFFF").font("Helvetica").fontSize(8);
            doc.text(`Total: ${logs.length}`, c1, y + 9, { lineBreak: false });
            doc.text(`Success: ${successCount}`, c1 + 120, y + 9, { lineBreak: false });
            doc.text(`Failed/Error: ${failCount}`, c2 + 20, y + 9, { lineBreak: false });
            doc.text(`Other: ${otherCount}`, c3, y + 9, { lineBreak: false });
            y += 34;
            const colW = { date: 108, action: 128, module: 76, status: 58, ip: 80, desc: CONTENT_W - 108 - 128 - 76 - 58 - 80 };
            const colX = {
                date: MARGIN,
                action: MARGIN + colW.date,
                module: MARGIN + colW.date + colW.action,
                status: MARGIN + colW.date + colW.action + colW.module,
                ip: MARGIN + colW.date + colW.action + colW.module + colW.status,
                desc: MARGIN + colW.date + colW.action + colW.module + colW.status + colW.ip,
            };
            const ROW_H = 16;
            let pageNum = 1;
            y = drawTableHeader(doc, colX, colW, y, ROW_H + 2);
            if (logs.length === 0) {
                doc.rect(MARGIN, y, CONTENT_W, 40).fill("#F9FAFB");
                doc.fillColor("#9CA3AF").font("Helvetica").fontSize(9)
                    .text("No activity logs found for the selected criteria.", MARGIN, y + 14, {
                    width: CONTENT_W, align: "center",
                });
            }
            for (let i = 0; i < logs.length; i++) {
                if (y + ROW_H > BOTTOM_LIMIT) {
                    drawActivityFooter(doc, pageNum, genDateStr);
                    pageNum++;
                    doc.addPage();
                    y = MARGIN;
                    y = drawTableHeader(doc, colX, colW, y, ROW_H + 2);
                }
                const log = logs[i];
                const rowBg = i % 2 === 0 ? PDF_ROW_A : "#FFFFFF";
                const stUC = ((_c = log.status) !== null && _c !== void 0 ? _c : "").toUpperCase();
                const stColor = stUC === "SUCCESS" ? "#15803D"
                    : stUC === "FAILED" || stUC === "ERROR" ? "#DC2626"
                        : "#92400E";
                doc.rect(MARGIN, y, CONTENT_W, ROW_H).fill(rowBg);
                doc.rect(MARGIN, y, CONTENT_W, ROW_H).lineWidth(0.3).stroke(PDF_BORDER);
                doc.fillColor("#333333").font("Helvetica").fontSize(6.5)
                    .text(pdfFmtDate(log.createdAt), colX.date + 3, y + 5, { width: colW.date - 4, lineBreak: false });
                doc.text(pdfTrunc(log.action, 24), colX.action + 3, y + 5, { width: colW.action - 4, lineBreak: false });
                doc.text(pdfTrunc(log.module, 13), colX.module + 3, y + 5, { width: colW.module - 4, lineBreak: false });
                doc.fillColor(stColor).font("Helvetica-Bold")
                    .text(pdfTrunc(log.status, 10), colX.status + 3, y + 5, { width: colW.status - 4, lineBreak: false });
                doc.fillColor("#333333").font("Helvetica")
                    .text(pdfTrunc(log.ipAddress, 15), colX.ip + 3, y + 5, { width: colW.ip - 4, lineBreak: false });
                doc.text(pdfTrunc(log.description, 11), colX.desc + 3, y + 5, { width: colW.desc - 4, lineBreak: false });
                y += ROW_H;
            }
            drawActivityFooter(doc, pageNum, genDateStr);
            doc.end();
        }
        catch (error) {
            console.error("downloadActivityLogsPdf error:", error);
            if (!res.headersSent) {
                res.status(500).json({ error: "Failed to generate activity log PDF" });
            }
        }
    });
}
