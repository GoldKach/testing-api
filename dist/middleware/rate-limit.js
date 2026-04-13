"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginLimiter = exports.registrationLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.registrationLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1,
    max: 20,
    message: {
        success: false,
        data: null,
        message: "Too many registration attempts from this IP. Please try again after 1 hour.",
        errors: {}
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(429).json({
            success: false,
            data: null,
            message: "Too many registration attempts from this IP. Please try again after 1 hour.",
            errors: {}
        });
    },
});
exports.loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        data: null,
        error: "Too many login attempts. Please try again after 15 minutes.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
