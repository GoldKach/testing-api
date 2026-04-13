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
exports.sendVerificationCodeResend = void 0;
exports.sendResetEmailResend = sendResetEmailResend;
exports.sendVerifyEmailResend = sendVerifyEmailResend;
exports.sendLoginVerificationCode = sendLoginVerificationCode;
const login_verification_code_1 = __importDefault(require("../emails/login-verification-code"));
const reset_password_email_1 = __importDefault(require("../emails/reset-password-email"));
const VerificationCodeEmail_1 = __importDefault(require("../emails/VerificationCodeEmail"));
const resend_1 = require("resend");
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
const FROM = process.env.MAIL_FROM || "GoldKach <no-reply@goldkach.com>";
function sendResetEmailResend(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const { to, name, resetUrl } = args;
        const { error } = yield resend.emails.send({
            from: FROM,
            to,
            subject: "Reset your password - GoldKach",
            react: (0, reset_password_email_1.default)({ name, resetUrl }),
        });
        if (error)
            throw error;
    });
}
function sendVerifyEmailResend(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const { to, name, code } = args;
        const { data, error } = yield resend.emails.send({
            from: FROM,
            to,
            subject: "Verify your email with GoldKach",
            react: (0, VerificationCodeEmail_1.default)({ name, code }),
        });
        if (error)
            throw error;
        console.log("Verification email id:", data === null || data === void 0 ? void 0 : data.id, "to:", to);
        return { ok: true, id: data === null || data === void 0 ? void 0 : data.id };
    });
}
function sendLoginVerificationCode(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const { to, name, code } = args;
        const { data, error } = yield resend.emails.send({
            from: FROM,
            to,
            subject: "Login Verification Code - GoldKach",
            react: (0, login_verification_code_1.default)({ name, code }),
        });
        if (error) {
            console.error("Failed to send login verification email:", error);
            throw error;
        }
        console.log("Login verification email id:", data === null || data === void 0 ? void 0 : data.id, "to:", to);
        return { ok: true, id: data === null || data === void 0 ? void 0 : data.id };
    });
}
exports.sendVerificationCodeResend = sendVerifyEmailResend;
