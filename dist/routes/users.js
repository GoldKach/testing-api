"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const users_1 = require("../controllers/users");
const rate_limit_1 = require("../middleware/rate-limit");
const auth_1 = require("../utils/auth");
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const userRouter = express_1.default.Router();
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        status: 429,
        error: "Too many login attempts. Please try again after 15 minutes.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
userRouter.post("/register", rate_limit_1.registrationLimiter, users_1.createUser);
userRouter.post("/login", loginLimiter, users_1.loginUser);
userRouter.get("/users", users_1.getAllUsers);
userRouter.delete("/users/:id", auth_1.authenticateToken, users_1.deleteUser);
userRouter.get("/me", auth_1.authenticateToken, users_1.getCurrentUser);
userRouter.get("/users/:id", users_1.getUserById);
userRouter.put("/users/:id", users_1.updateUser);
exports.default = userRouter;
