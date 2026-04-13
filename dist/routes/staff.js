"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const staff_1 = require("../controllers/staff");
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const staffRouter = express_1.default.Router();
const staffWriteLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: {
        status: 429,
        error: "Too many requests. Please try again after 15 minutes.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
staffRouter.post("/", staffWriteLimiter, staff_1.createStaffMember);
staffRouter.get("/", staff_1.getAllStaff);
staffRouter.get("/agent-for-client/:clientId", staff_1.getAgentForClient);
staffRouter.get("/:id", staff_1.getStaffById);
staffRouter.put("/:id", staffWriteLimiter, staff_1.updateStaffMember);
staffRouter.delete("/:id", staffWriteLimiter, staff_1.deactivateStaffMember);
staffRouter.get("/:id/clients", staff_1.getAgentClients);
staffRouter.post("/:id/clients", staffWriteLimiter, staff_1.assignClientToAgent);
staffRouter.delete("/:id/clients/:clientId", staffWriteLimiter, staff_1.unassignClientFromAgent);
staffRouter.delete("/:id/delete", staff_1.hardDeleteStaffMember);
exports.default = staffRouter;
