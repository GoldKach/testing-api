"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authenticateToken(req, res, next) {
    var _a, _b;
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({ error: "No token provided" });
    }
    const secret = (_b = (_a = process.env.JWT_SECRET) !== null && _a !== void 0 ? _a : process.env.ACCESS_TOKEN_SECRET) !== null && _b !== void 0 ? _b : "";
    jsonwebtoken_1.default.verify(token, secret, (err, decoded) => {
        if (err || !decoded) {
            return res.status(403).json({ error: "Invalid or expired token" });
        }
        req.user = decoded;
        next();
    });
}
