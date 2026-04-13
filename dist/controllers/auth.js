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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.resendVerification = resendVerification;
exports.verifyEmail = verifyEmail;
exports.refreshToken = refreshToken;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mailer_1 = require("../utils/mailer");
const mailer_2 = require("../lib/mailer");
const client_1 = require("@prisma/client");
const tokens_1 = require("../utils/tokens");
const RESET_TTL_MIN = 30;
function forgotPassword(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const { email } = req.body;
        const generic = { ok: true, message: "If that email exists, a reset link has been sent." };
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
            yield (0, mailer_1.sendResetEmailResend)({
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
                return res.status(400).json({ error: "Missing fields." });
            }
            const tokenHash = crypto_1.default.createHash("sha256").update(token).digest("hex");
            const record = yield db_1.db.passwordResetToken.findFirst({
                where: { userId: uid, tokenHash },
            });
            if (!record || record.usedAt || record.expiresAt < new Date()) {
                return res.status(400).json({ error: "Invalid or expired reset token." });
            }
            const hashed = yield bcryptjs_1.default.hash(newPassword, 12);
            yield db_1.db.$transaction([
                db_1.db.user.update({ where: { id: uid }, data: { password: hashed } }),
                db_1.db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
                db_1.db.refreshToken.deleteMany({ where: { userId: uid } }),
            ]);
            return res.status(200).json({ ok: true, message: "Password updated." });
        }
        catch (e) {
            console.error("resetPassword error:", e);
            return res.status(500).json({ error: "Server error" });
        }
    });
}
function resendVerification(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const { email } = req.body;
        if (!email)
            return res.status(400).json({ error: "Email is required." });
        const user = yield db_1.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
        if (!user)
            return res.status(200).json({ ok: true });
        const newCode = String(crypto_1.default.randomInt(0, 1000000)).padStart(6, "0");
        yield db_1.db.user.update({
            where: { id: user.id },
            data: { token: newCode },
        });
        yield (0, mailer_2.sendVerificationCodeResend)({
            to: user.email,
            name: (_b = (_a = user.firstName) !== null && _a !== void 0 ? _a : user.name) !== null && _b !== void 0 ? _b : "there",
            code: newCode,
        });
        return res.status(200).json({ ok: true });
    });
}
function verifyEmail(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { email, token } = req.body;
        console.log("[verifyEmail] Received request — email:", email, "token:", token);
        if (!email || !token) {
            return res.status(400).json({ error: "Missing fields." });
        }
        const normalizedEmail = email.trim().toLowerCase();
        const user = yield db_1.db.user.findUnique({
            where: { email: normalizedEmail },
        });
        if (!user) {
            console.log("[verifyEmail] User not found");
            return res.status(400).json({ error: "Invalid verification code." });
        }
        if (!user.token) {
            console.log("[verifyEmail] No token in DB (already used?)");
            return res.status(400).json({ error: "Invalid verification code." });
        }
        const dbToken = String(user.token).trim();
        const inputToken = String(token).trim();
        if (dbToken !== inputToken) {
            console.log("[verifyEmail] Token mismatch");
            return res.status(400).json({ error: "Invalid verification code." });
        }
        yield db_1.db.user.update({
            where: { id: user.id },
            data: { emailVerified: true, status: client_1.UserStatus.ACTIVE, token: null },
        });
        console.log("[verifyEmail] User verified:", user.id);
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            phone: user.phone,
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
        return res.status(200).json({
            ok: true,
            userId: user.id,
            email: user.email,
            accessToken,
            refreshToken,
        });
    });
}
function refreshToken(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const { refreshToken: token } = req.body;
        if (!token) {
            return res.status(400).json({ error: "Refresh token required" });
        }
        try {
            const payload = (0, tokens_1.verifyRefreshToken)(token);
            const stored = yield db_1.db.refreshToken.findUnique({ where: { token } });
            if (!stored || stored.revoked || stored.expiresAt < new Date()) {
                return res.status(401).json({ error: "Refresh token expired or revoked" });
            }
            const newPayload = {
                userId: payload.userId,
                email: payload.email,
                role: payload.role,
                phone: (_a = payload.phone) !== null && _a !== void 0 ? _a : "",
            };
            const accessToken = (0, tokens_1.generateAccessToken)(newPayload);
            return res.status(200).json({ accessToken });
        }
        catch (_b) {
            return res.status(401).json({ error: "Invalid refresh token" });
        }
    });
}
