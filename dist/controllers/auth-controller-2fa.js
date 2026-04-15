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
exports.initiateLogin = initiateLogin;
exports.verifyLoginCode = verifyLoginCode;
exports.resendLoginCode = resendLoginCode;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.verifyEmail = verifyEmail;
exports.resendVerification = resendVerification;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const tokens_1 = require("../utils/tokens");
const mailer_1 = require("../utils/mailer");
const mailer_2 = require("../lib/mailer");
const RESET_TTL_MIN = 30;
const LOGIN_CODE_TTL_MIN = 10;
const makeSixDigitToken = () => String(crypto_1.default.randomInt(0, 1000000)).padStart(6, "0");
function initiateLogin(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const { identifier, password } = req.body;
        try {
            if (!identifier || !password) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "Missing credentials"
                });
            }
            const idNorm = identifier.trim().toLowerCase();
            const user = yield db_1.db.user.findFirst({
                where: {
                    OR: [
                        { email: idNorm },
                        { phone: identifier.trim() }
                    ],
                },
            });
            if (!user) {
                return res.status(401).json({
                    success: false,
                    data: null,
                    error: "Invalid credentials"
                });
            }
            if (user.status === client_1.UserStatus.BANNED) {
                return res.status(403).json({
                    success: false,
                    data: null,
                    error: "Account has been banned. Contact support."
                });
            }
            if (user.status === client_1.UserStatus.SUSPENDED) {
                return res.status(403).json({
                    success: false,
                    data: null,
                    error: "Account is temporarily suspended. Contact support."
                });
            }
            if (user.status === client_1.UserStatus.DEACTIVATED) {
                return res.status(403).json({
                    success: false,
                    data: null,
                    error: "Account is deactivated. Contact support to reactivate."
                });
            }
            if (!user.password) {
                return res.status(401).json({
                    success: false,
                    data: null,
                    error: "This account has no password. Use social login or reset password."
                });
            }
            const isPasswordValid = yield bcryptjs_1.default.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    data: null,
                    error: "Invalid credentials"
                });
            }
            if (!user.emailVerified) {
                const verificationCode = makeSixDigitToken();
                const codeExpiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MIN * 60000);
                yield db_1.db.user.update({
                    where: { id: user.id },
                    data: { token: verificationCode },
                });
                try {
                    yield (0, mailer_2.sendVerificationCodeResend)({
                        to: user.email,
                        name: (_b = (_a = user.firstName) !== null && _a !== void 0 ? _a : user.name) !== null && _b !== void 0 ? _b : "there",
                        code: verificationCode,
                    });
                }
                catch (emailError) {
                    console.error("Error sending verification email:", emailError);
                    return res.status(500).json({
                        success: false,
                        data: null,
                        error: "Failed to send verification code. Please try again."
                    });
                }
                return res.status(200).json({
                    success: true,
                    data: {
                        userId: user.id,
                        email: user.email,
                        requiresEmailVerification: true,
                        expiresAt: codeExpiresAt,
                    },
                    message: "Please verify your email first. A verification code has been sent to your inbox.",
                });
            }
            const verificationCode = makeSixDigitToken();
            const codeExpiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MIN * 60000);
            const tokenData = JSON.stringify({
                code: verificationCode,
                expiresAt: codeExpiresAt.toISOString(),
                type: "login_2fa"
            });
            yield db_1.db.user.update({
                where: { id: user.id },
                data: { token: tokenData },
            });
            try {
                yield (0, mailer_1.sendLoginVerificationCode)({
                    to: user.email,
                    name: (_d = (_c = user.firstName) !== null && _c !== void 0 ? _c : user.name) !== null && _d !== void 0 ? _d : "there",
                    code: verificationCode,
                });
            }
            catch (emailError) {
                console.error("Error sending login verification email:", emailError);
                return res.status(500).json({
                    success: false,
                    data: null,
                    error: "Failed to send verification code. Please try again."
                });
            }
            return res.status(200).json({
                success: true,
                data: {
                    userId: user.id,
                    email: user.email,
                    requiresVerification: true,
                    expiresAt: codeExpiresAt,
                },
                message: "Verification code sent to your email. Please check your inbox.",
            });
        }
        catch (error) {
            console.error("Initiate login error:", error);
            return res.status(500).json({
                success: false,
                data: null,
                error: "An error occurred during login"
            });
        }
    });
}
function verifyLoginCode(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const { userId, code } = req.body;
        try {
            if (!userId || !code) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "Missing verification code or user ID"
                });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                include: {
                    individualOnboarding: { select: { isApproved: true } },
                    companyOnboarding: { select: { isApproved: true } },
                },
            });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    data: null,
                    error: "User not found"
                });
            }
            if (user.role === "USER") {
                const onboarding = (_a = user.individualOnboarding) !== null && _a !== void 0 ? _a : user.companyOnboarding;
                if (onboarding && onboarding.isApproved === false) {
                    return res.status(403).json({
                        success: false,
                        data: null,
                        error: "ONBOARDING_PENDING_APPROVAL",
                    });
                }
            }
            if (!user.token) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "No verification code found. Please request a new code."
                });
            }
            let tokenData;
            try {
                tokenData = JSON.parse(user.token);
            }
            catch (e) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "Invalid verification code format"
                });
            }
            if (tokenData.type !== "login_2fa") {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "Invalid verification code type"
                });
            }
            const expiryDate = new Date(tokenData.expiresAt);
            if (expiryDate < new Date()) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "Verification code has expired. Please login again."
                });
            }
            const dbCode = String(tokenData.code).trim();
            const inputCode = String(code).trim();
            if (dbCode !== inputCode) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "Invalid verification code"
                });
            }
            yield db_1.db.user.update({
                where: { id: user.id },
                data: {
                    token: null,
                    status: user.status === client_1.UserStatus.PENDING ? client_1.UserStatus.ACTIVE : user.status,
                    emailVerified: true,
                },
            });
            const payload = {
                userId: user.id,
                phone: user.phone,
                email: user.email,
                role: user.role,
            };
            const accessToken = (0, tokens_1.generateAccessToken)(payload);
            const refreshToken = (0, tokens_1.generateRefreshToken)(payload);
            yield db_1.db.refreshToken.create({
                data: {
                    token: refreshToken,
                    userId: user.id,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                },
            });
            const { password: _pw, token: _token } = user, safeUser = __rest(user, ["password", "token"]);
            return res.status(200).json({
                success: true,
                data: {
                    user: safeUser,
                    accessToken,
                    refreshToken
                },
                message: "Login successful",
            });
        }
        catch (error) {
            console.error("Verify login code error:", error);
            return res.status(500).json({
                success: false,
                data: null,
                error: "An error occurred during verification"
            });
        }
    });
}
function resendLoginCode(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const { userId } = req.body;
        try {
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "User ID is required"
                });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
            });
            if (!user) {
                return res.status(404).json({
                    success: false,
                    data: null,
                    error: "User not found"
                });
            }
            const verificationCode = makeSixDigitToken();
            const codeExpiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MIN * 60000);
            const tokenData = JSON.stringify({
                code: verificationCode,
                expiresAt: codeExpiresAt.toISOString(),
                type: "login_2fa"
            });
            yield db_1.db.user.update({
                where: { id: user.id },
                data: { token: tokenData },
            });
            try {
                yield (0, mailer_1.sendLoginVerificationCode)({
                    to: user.email,
                    name: (_b = (_a = user.firstName) !== null && _a !== void 0 ? _a : user.name) !== null && _b !== void 0 ? _b : "there",
                    code: verificationCode,
                });
            }
            catch (emailError) {
                console.error("Error sending login verification email:", emailError);
                return res.status(500).json({
                    success: false,
                    data: null,
                    error: "Failed to send verification code"
                });
            }
            return res.status(200).json({
                success: true,
                data: {
                    expiresAt: codeExpiresAt,
                },
                message: "New verification code sent to your email",
            });
        }
        catch (error) {
            console.error("Resend login code error:", error);
            return res.status(500).json({
                success: false,
                data: null,
                error: "Failed to resend verification code"
            });
        }
    });
}
function forgotPassword(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const { email } = req.body;
        const generic = {
            success: true,
            message: "If that email exists, a reset link has been sent."
        };
        try {
            if (!email)
                return res.status(200).json(generic);
            const user = yield db_1.db.user.findUnique({
                where: { email: email.trim().toLowerCase() },
            });
            if (!user)
                return res.status(200).json(generic);
            yield db_1.db.passwordResetToken.deleteMany({
                where: { userId: user.id, usedAt: null },
            });
            const rawToken = crypto_1.default.randomBytes(32).toString("hex");
            const tokenHash = crypto_1.default.createHash("sha256").update(rawToken).digest("hex");
            yield db_1.db.passwordResetToken.create({
                data: {
                    userId: user.id,
                    tokenHash,
                    expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60000),
                },
            });
            const appUrl = (_a = process.env.APP_URL) !== null && _a !== void 0 ? _a : "http://localhost:3000";
            const resetUrl = `${appUrl}/reset-password?token=${rawToken}&uid=${user.id}`;
            yield (0, mailer_2.sendResetEmailResend)({
                to: user.email,
                name: (_c = (_b = user.name) !== null && _b !== void 0 ? _b : user.firstName) !== null && _c !== void 0 ? _c : "there",
                resetUrl,
            });
            return res.status(200).json(generic);
        }
        catch (e) {
            console.error("forgotPassword error:", e);
            return res.status(200).json(generic);
        }
    });
}
function resetPassword(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { uid, token, newPassword } = req.body;
        try {
            if (!uid || !token || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: "Missing fields."
                });
            }
            const tokenHash = crypto_1.default.createHash("sha256").update(token).digest("hex");
            const record = yield db_1.db.passwordResetToken.findFirst({
                where: { userId: uid, tokenHash },
            });
            if (!record || record.usedAt || record.expiresAt < new Date()) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid or expired reset token."
                });
            }
            const hashed = yield bcryptjs_1.default.hash(newPassword, 12);
            yield db_1.db.$transaction([
                db_1.db.user.update({ where: { id: uid }, data: { password: hashed } }),
                db_1.db.passwordResetToken.update({
                    where: { id: record.id },
                    data: { usedAt: new Date() }
                }),
                db_1.db.refreshToken.deleteMany({ where: { userId: uid } }),
            ]);
            return res.status(200).json({
                success: true,
                message: "Password updated successfully."
            });
        }
        catch (e) {
            console.error("resetPassword error:", e);
            return res.status(500).json({
                success: false,
                error: "Server error"
            });
        }
    });
}
function verifyEmail(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { email, token } = req.body;
        console.log("[verifyEmail] Received request");
        console.log("[verifyEmail] Email:", email);
        console.log("[verifyEmail] Token:", token);
        if (!email || !token) {
            console.log("[verifyEmail] Missing fields");
            return res.status(400).json({
                success: false,
                error: "Missing fields."
            });
        }
        const normalizedEmail = email.trim().toLowerCase();
        console.log("[verifyEmail] Normalized email:", normalizedEmail);
        const user = yield db_1.db.user.findUnique({
            where: { email: normalizedEmail },
        });
        if (!user) {
            console.log("[verifyEmail] User not found");
            return res.status(400).json({
                success: false,
                error: "Invalid verification code."
            });
        }
        console.log("[verifyEmail] User found - ID:", user.id);
        if (!user.token) {
            console.log("[verifyEmail] No token in database");
            return res.status(400).json({
                success: false,
                error: "Invalid verification code."
            });
        }
        let codeToCompare;
        try {
            const tokenData = JSON.parse(user.token);
            if (tokenData.type === "login_2fa") {
                return res.status(400).json({
                    success: false,
                    error: "Invalid verification code type."
                });
            }
            codeToCompare = tokenData.code || user.token;
        }
        catch (_a) {
            codeToCompare = user.token;
        }
        const dbToken = String(codeToCompare).trim();
        const inputToken = String(token).trim();
        console.log("[verifyEmail] Comparing tokens");
        if (dbToken !== inputToken) {
            console.log("[verifyEmail] Token mismatch!");
            return res.status(400).json({
                success: false,
                error: "Invalid verification code."
            });
        }
        console.log("[verifyEmail] Token verified, updating user...");
        yield db_1.db.user.update({
            where: { id: user.id },
            data: {
                emailVerified: true,
                status: client_1.UserStatus.ACTIVE,
                token: null
            },
        });
        console.log("[verifyEmail] User updated successfully");
        return res.status(200).json({
            success: true,
            data: {
                userId: user.id,
                email: user.email,
            },
            message: "Email verified successfully",
        });
    });
}
function resendVerification(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                error: "Email is required."
            });
        }
        const user = yield db_1.db.user.findUnique({
            where: { email: email.trim().toLowerCase() }
        });
        if (!user) {
            return res.status(200).json({
                success: true,
                message: "If that email exists, a verification code has been sent."
            });
        }
        const newCode = makeSixDigitToken();
        yield db_1.db.user.update({
            where: { id: user.id },
            data: { token: newCode },
        });
        yield (0, mailer_2.sendVerificationCodeResend)({
            to: user.email,
            name: (_b = (_a = user.firstName) !== null && _a !== void 0 ? _a : user.name) !== null && _b !== void 0 ? _b : "there",
            code: newCode,
        });
        return res.status(200).json({
            success: true,
            message: "Verification code sent to your email."
        });
    });
}
