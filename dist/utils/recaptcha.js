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
exports.verifyRecaptcha = verifyRecaptcha;
const axios_1 = __importDefault(require("axios"));
function verifyRecaptcha(token) {
    return __awaiter(this, void 0, void 0, function* () {
        const secretKey = process.env.RECAPTCHA_SECRET_KEY;
        if (!secretKey) {
            console.error("⚠️ RECAPTCHA_SECRET_KEY not set in .env");
            return {
                success: false,
                error: "Server configuration error",
            };
        }
        if (!token || token.trim() === "") {
            return {
                success: false,
                error: "reCAPTCHA token is required",
            };
        }
        try {
            const response = yield axios_1.default.post("https://www.google.com/recaptcha/api/siteverify", null, {
                params: {
                    secret: secretKey,
                    response: token,
                },
                timeout: 5000,
            });
            if (!response.data.success) {
                console.error("❌ reCAPTCHA verification failed:", response.data["error-codes"]);
                return {
                    success: false,
                    error: "reCAPTCHA verification failed. Please try again.",
                };
            }
            console.log("✅ reCAPTCHA verification successful");
            return { success: true };
        }
        catch (error) {
            console.error("❌ Error verifying reCAPTCHA:", error.message);
            return {
                success: false,
                error: "Failed to verify reCAPTCHA. Please try again.",
            };
        }
    });
}
