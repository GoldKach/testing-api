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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAMLRiskAssessment = getAMLRiskAssessment;
exports.upsertAMLRiskAssessment = upsertAMLRiskAssessment;
const db_1 = require("../db/db");
function getAMLRiskAssessment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { userId } = req.params;
        try {
            const record = yield db_1.db.aMLRiskAssessment.findUnique({ where: { userId } });
            return res.json({ success: true, data: record !== null && record !== void 0 ? record : null });
        }
        catch (error) {
            console.error("getAMLRiskAssessment error:", error);
            return res.status(500).json({ success: false, data: null, error: "Server error." });
        }
    });
}
function generateAssessmentRef() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const all = yield db_1.db.aMLRiskAssessment.findMany({ select: { data: true } });
        let max = 0;
        for (const row of all) {
            const ref = (_a = row.data) === null || _a === void 0 ? void 0 : _a.assessmentRef;
            if (ref) {
                const match = ref.match(/^AML-CDD-(\d+)$/);
                if (match) {
                    const n = parseInt(match[1], 10);
                    if (n > max)
                        max = n;
                }
            }
        }
        return `AML-CDD-${String(max + 1).padStart(3, "0")}`;
    });
}
function upsertAMLRiskAssessment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const { userId } = req.params;
        const { data, updatedBy } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, data: null, error: "userId is required." });
        }
        try {
            const userExists = yield db_1.db.user.findUnique({ where: { id: userId }, select: { id: true } });
            if (!userExists) {
                return res.status(404).json({ success: false, data: null, error: "User not found." });
            }
            const existing = yield db_1.db.aMLRiskAssessment.findUnique({ where: { userId } });
            let finalData = data !== null && data !== void 0 ? data : {};
            if (!existing) {
                finalData = Object.assign(Object.assign({}, finalData), { assessmentRef: yield generateAssessmentRef() });
            }
            else {
                const existingRef = (_a = existing.data) === null || _a === void 0 ? void 0 : _a.assessmentRef;
                if (existingRef) {
                    finalData = Object.assign(Object.assign({}, finalData), { assessmentRef: existingRef });
                }
                else {
                    finalData = Object.assign(Object.assign({}, finalData), { assessmentRef: yield generateAssessmentRef() });
                }
            }
            const record = yield db_1.db.aMLRiskAssessment.upsert({
                where: { userId },
                create: { userId, data: finalData, updatedBy: updatedBy !== null && updatedBy !== void 0 ? updatedBy : null },
                update: { data: finalData, updatedBy: updatedBy !== null && updatedBy !== void 0 ? updatedBy : null },
            });
            return res.json({ success: true, data: record });
        }
        catch (error) {
            console.error("upsertAMLRiskAssessment error:", error);
            return res.status(500).json({ success: false, data: null, error: "Server error." });
        }
    });
}
