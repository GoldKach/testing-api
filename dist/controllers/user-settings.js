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
exports.getUserSettings = getUserSettings;
exports.updateProfile = updateProfile;
exports.updateEmail = updateEmail;
exports.updatePhone = updatePhone;
exports.updatePassword = updatePassword;
exports.updateProfileImage = updateProfileImage;
exports.deleteAccount = deleteAccount;
const db_1 = require("../db/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const SALT_ROUNDS = 10;
function getUserIdFromRequest(req) {
    var _a, _b, _c;
    return (((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) ||
        ((_b = req.body) === null || _b === void 0 ? void 0 : _b.userId) ||
        ((_c = req.query) === null || _c === void 0 ? void 0 : _c.userId) ||
        null);
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPhone(phone) {
    return /^\+?[1-9]\d{1,14}$/.test(phone);
}
function getUserSettings(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserIdFromRequest(req);
            if (!userId) {
                return res.status(401).json({ data: null, error: "Unauthorized - Please login again" });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    name: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    emailVerified: true,
                    phone: true,
                    imageUrl: true,
                    role: true,
                    status: true,
                    isApproved: true,
                    createdAt: true,
                    updatedAt: true,
                    masterWallet: {
                        select: {
                            id: true,
                            accountNumber: true,
                            totalDeposited: true,
                            totalWithdrawn: true,
                            totalFees: true,
                            netAssetValue: true,
                            status: true,
                        },
                    },
                    userPortfolios: {
                        where: { isActive: true },
                        orderBy: { createdAt: "desc" },
                        select: {
                            id: true,
                            customName: true,
                            portfolioValue: true,
                            totalInvested: true,
                            totalLossGain: true,
                            isActive: true,
                            portfolio: { select: { id: true, name: true, riskTolerance: true, timeHorizon: true } },
                            wallet: {
                                select: {
                                    id: true,
                                    accountNumber: true,
                                    netAssetValue: true,
                                    balance: true,
                                    status: true,
                                },
                            },
                        },
                    },
                },
            });
            if (!user) {
                return res.status(404).json({ data: null, error: "User not found" });
            }
            return res.status(200).json({ data: user, error: null });
        }
        catch (error) {
            console.error("getUserSettings error:", error);
            return res.status(500).json({ data: null, error: "Failed to fetch user settings" });
        }
    });
}
function updateProfile(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserIdFromRequest(req);
            if (!userId) {
                return res.status(401).json({ data: null, error: "Unauthorized" });
            }
            const { name, firstName, lastName } = req.body;
            if (!name && !firstName && !lastName) {
                return res.status(400).json({
                    data: null,
                    error: "At least one field (name, firstName, lastName) must be provided",
                });
            }
            if (name && name.trim().length < 2)
                return res.status(400).json({ data: null, error: "Name must be at least 2 characters" });
            if (firstName && firstName.trim().length < 2)
                return res.status(400).json({ data: null, error: "First name must be at least 2 characters" });
            if (lastName && lastName.trim().length < 2)
                return res.status(400).json({ data: null, error: "Last name must be at least 2 characters" });
            const updated = yield db_1.db.user.update({
                where: { id: userId },
                data: Object.assign(Object.assign(Object.assign({}, (name && { name: name.trim() })), (firstName && { firstName: firstName.trim() })), (lastName && { lastName: lastName.trim() })),
                select: {
                    id: true, name: true, firstName: true, lastName: true,
                    email: true, phone: true, imageUrl: true, updatedAt: true,
                },
            });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (error) {
            console.error("updateProfile error:", error);
            return res.status(500).json({ data: null, error: "Failed to update profile" });
        }
    });
}
function updateEmail(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserIdFromRequest(req);
            if (!userId)
                return res.status(401).json({ data: null, error: "Unauthorized" });
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ data: null, error: "Email and password are required" });
            }
            if (!isValidEmail(email)) {
                return res.status(400).json({ data: null, error: "Invalid email format" });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, password: true },
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            if (!(yield bcryptjs_1.default.compare(password, user.password))) {
                return res.status(401).json({ data: null, error: "Invalid password" });
            }
            const conflict = yield db_1.db.user.findUnique({ where: { email: email.toLowerCase() } });
            if (conflict && conflict.id !== userId) {
                return res.status(409).json({ data: null, error: "Email already in use" });
            }
            const updated = yield db_1.db.user.update({
                where: { id: userId },
                data: { email: email.toLowerCase(), emailVerified: false },
                select: { id: true, email: true, emailVerified: true, updatedAt: true },
            });
            return res.status(200).json({
                data: updated,
                error: null,
                message: "Email updated. Please verify your new email address.",
            });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Email already in use" });
            }
            console.error("updateEmail error:", error);
            return res.status(500).json({ data: null, error: "Failed to update email" });
        }
    });
}
function updatePhone(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserIdFromRequest(req);
            if (!userId)
                return res.status(401).json({ data: null, error: "Unauthorized" });
            const { phone, password } = req.body;
            if (!phone || !password) {
                return res.status(400).json({ data: null, error: "Phone and password are required" });
            }
            if (!isValidPhone(phone)) {
                return res.status(400).json({
                    data: null,
                    error: "Invalid phone format. Use international format (e.g. +256700000000)",
                });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { id: true, phone: true, password: true },
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            if (!(yield bcryptjs_1.default.compare(password, user.password))) {
                return res.status(401).json({ data: null, error: "Invalid password" });
            }
            const conflict = yield db_1.db.user.findUnique({ where: { phone } });
            if (conflict && conflict.id !== userId) {
                return res.status(409).json({ data: null, error: "Phone number already in use" });
            }
            const updated = yield db_1.db.user.update({
                where: { id: userId },
                data: { phone },
                select: { id: true, phone: true, updatedAt: true },
            });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({ data: null, error: "Phone number already in use" });
            }
            console.error("updatePhone error:", error);
            return res.status(500).json({ data: null, error: "Failed to update phone" });
        }
    });
}
function updatePassword(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserIdFromRequest(req);
            if (!userId)
                return res.status(401).json({ data: null, error: "Unauthorized" });
            const { currentPassword, newPassword, confirmPassword } = req.body;
            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({ data: null, error: "Current password, new password, and confirmation are required" });
            }
            if (newPassword.length < 8) {
                return res.status(400).json({ data: null, error: "New password must be at least 8 characters long" });
            }
            if (newPassword !== confirmPassword) {
                return res.status(400).json({ data: null, error: "New password and confirmation do not match" });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { id: true, password: true },
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            if (!(yield bcryptjs_1.default.compare(currentPassword, user.password))) {
                return res.status(401).json({ data: null, error: "Current password is incorrect" });
            }
            if (yield bcryptjs_1.default.compare(newPassword, user.password)) {
                return res.status(400).json({ data: null, error: "New password must be different from current password" });
            }
            yield db_1.db.user.update({
                where: { id: userId },
                data: { password: yield bcryptjs_1.default.hash(newPassword, SALT_ROUNDS) },
            });
            return res.status(200).json({ data: null, error: null, message: "Password updated successfully" });
        }
        catch (error) {
            console.error("updatePassword error:", error);
            return res.status(500).json({ data: null, error: "Failed to update password" });
        }
    });
}
function updateProfileImage(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserIdFromRequest(req);
            if (!userId)
                return res.status(401).json({ data: null, error: "Unauthorized" });
            const { imageUrl } = req.body;
            if (imageUrl === undefined || imageUrl === null) {
                return res.status(400).json({ data: null, error: "Image URL is required" });
            }
            if (imageUrl !== "") {
                try {
                    new URL(imageUrl);
                }
                catch (_a) {
                    return res.status(400).json({ data: null, error: "Invalid image URL" });
                }
            }
            const updated = yield db_1.db.user.update({
                where: { id: userId },
                data: { imageUrl },
                select: { id: true, imageUrl: true, updatedAt: true },
            });
            return res.status(200).json({ data: updated, error: null });
        }
        catch (error) {
            console.error("updateProfileImage error:", error);
            return res.status(500).json({ data: null, error: "Failed to update profile image" });
        }
    });
}
function deleteAccount(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = getUserIdFromRequest(req);
            if (!userId)
                return res.status(401).json({ data: null, error: "Unauthorized" });
            const { password, confirmation } = req.body;
            if (!password || confirmation !== "DELETE") {
                return res.status(400).json({
                    data: null,
                    error: "Password and confirmation (type 'DELETE') are required",
                });
            }
            const user = yield db_1.db.user.findUnique({
                where: { id: userId },
                select: { id: true, password: true, status: true },
            });
            if (!user)
                return res.status(404).json({ data: null, error: "User not found" });
            if (!(yield bcryptjs_1.default.compare(password, user.password))) {
                return res.status(401).json({ data: null, error: "Invalid password" });
            }
            yield db_1.db.user.update({ where: { id: userId }, data: { status: "DEACTIVATED" } });
            return res.status(200).json({ data: null, error: null, message: "Account deactivated successfully" });
        }
        catch (error) {
            console.error("deleteAccount error:", error);
            return res.status(500).json({ data: null, error: "Failed to delete account" });
        }
    });
}
