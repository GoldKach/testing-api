"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ACCESS_TOKEN_OPTIONS = {
    expiresIn: "60m",
};
const REFRESH_TOKEN_OPTIONS = {
    expiresIn: "30d",
};
function generateAccessToken(payload) {
    const secret = process.env.JWT_SECRET;
    return jsonwebtoken_1.default.sign(payload, secret, ACCESS_TOKEN_OPTIONS);
}
function generateRefreshToken(payload) {
    const secret = process.env.REFRESH_TOKEN_SECRET;
    return jsonwebtoken_1.default.sign(payload, secret, REFRESH_TOKEN_OPTIONS);
}
function verifyAccessToken(token) {
    const secret = process.env.JWT_SECRET;
    return jsonwebtoken_1.default.verify(token, secret);
}
function verifyRefreshToken(token) {
    const secret = process.env.REFRESH_TOKEN_SECRET;
    return jsonwebtoken_1.default.verify(token, secret);
}
