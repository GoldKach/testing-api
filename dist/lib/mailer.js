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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.sendResetEmailResend = sendResetEmailResend;
exports.sendVerificationCodeResend = sendVerificationCodeResend;
exports.sendOnboardingSubmittedEmail = sendOnboardingSubmittedEmail;
exports.sendAccountVerifiedEmail = sendAccountVerifiedEmail;
const React = __importStar(require("react"));
const resend_1 = require("resend");
const reset_password_email_1 = __importDefault(require("../emails/reset-password-email"));
const VerificationCodeEmail_1 = __importDefault(require("../emails/VerificationCodeEmail"));
const AccountVerifiedEmail_1 = __importDefault(require("../emails/AccountVerifiedEmail"));
const OnboardingSubmittedEmail_1 = __importDefault(require("../emails/OnboardingSubmittedEmail"));
const API_KEY = process.env.RESEND_API_KEY;
if (!API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
}
const resend = new resend_1.Resend(API_KEY);
const FROM = process.env.MAIL_FROM || "Goldkach <info@goldkach.co.ug>";
const REPLY_TO = process.env.MAIL_REPLY_TO || undefined;
function sendEmail(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const { to, subject, react, tags } = opts;
        const { data, error } = yield resend.emails.send({
            from: FROM,
            to,
            subject,
            react,
            replyTo: REPLY_TO,
            tags,
        });
        if (error) {
            console.error("[mailer] send failed:", error);
            throw new Error("Email send failed");
        }
        console.log("[mailer] sent", { id: data === null || data === void 0 ? void 0 : data.id, to });
        return { ok: true, id: data === null || data === void 0 ? void 0 : data.id };
    });
}
function sendResetEmailResend(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const { to, name = "there", resetUrl } = args;
        return sendEmail({
            to,
            subject: "Reset your password",
            react: React.createElement(reset_password_email_1.default, { name, resetUrl }),
            tags: [{ name: "category", value: "password-reset" }],
        });
    });
}
function sendVerificationCodeResend(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const { to, name = "there", code } = args;
        return sendEmail({
            to,
            subject: "Your verification code",
            react: React.createElement(VerificationCodeEmail_1.default, { name, code }),
            tags: [{ name: "category", value: "email-verify" }],
        });
    });
}
function sendOnboardingSubmittedEmail(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const { to, name = "there", isCompany = false } = args;
        return sendEmail({
            to,
            subject: "Your GoldKach application has been received",
            react: React.createElement(OnboardingSubmittedEmail_1.default, { name, isCompany }),
            tags: [{ name: "category", value: "onboarding-submitted" }],
        });
    });
}
function sendAccountVerifiedEmail(args) {
    return __awaiter(this, void 0, void 0, function* () {
        const { to, name = "there" } = args;
        return sendEmail({
            to,
            subject: "Your GoldKach email has been verified — next steps",
            react: React.createElement(AccountVerifiedEmail_1.default, { name }),
            tags: [{ name: "category", value: "account-verified" }],
        });
    });
}
