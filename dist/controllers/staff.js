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
exports.createStaffMember = createStaffMember;
exports.getAllStaff = getAllStaff;
exports.getStaffById = getStaffById;
exports.updateStaffMember = updateStaffMember;
exports.deactivateStaffMember = deactivateStaffMember;
exports.getAgentClients = getAgentClients;
exports.assignClientToAgent = assignClientToAgent;
exports.unassignClientFromAgent = unassignClientFromAgent;
exports.getAgentForClient = getAgentForClient;
exports.hardDeleteStaffMember = hardDeleteStaffMember;
const db_1 = require("../db/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const mailer_1 = require("../lib/mailer");
const makeSixDigitToken = () => String(crypto_1.default.randomInt(0, 1000000)).padStart(6, "0");
const STAFF_ROLES = [
    client_1.UserRole.AGENT,
    client_1.UserRole.CLIENT_RELATIONS,
    client_1.UserRole.ACCOUNT_MANAGER,
    client_1.UserRole.STAFF,
    client_1.UserRole.ADMIN,
    client_1.UserRole.MANAGER,
    client_1.UserRole.SUPER_ADMIN,
];
const isStaffRole = (role) => STAFF_ROLES.includes(role);
const staffSelect = {
    id: true,
    firstName: true,
    lastName: true,
    name: true,
    email: true,
    phone: true,
    imageUrl: true,
    role: true,
    status: true,
    isApproved: true,
    emailVerified: true,
    createdAt: true,
    updatedAt: true,
    staffProfile: {
        select: {
            id: true,
            employeeId: true,
            department: true,
            position: true,
            bio: true,
            isActive: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
        },
    },
};
const assignedClientSelect = {
    id: true,
    agentId: true,
    clientId: true,
    assignedById: true,
    assignedAt: true,
    isActive: true,
    unassignedAt: true,
    client: {
        select: {
            id: true,
            firstName: true,
            lastName: true,
            name: true,
            email: true,
            phone: true,
            imageUrl: true,
            role: true,
            status: true,
            isApproved: true,
            individualOnboarding: {
                select: {
                    id: true,
                    fullName: true,
                    isApproved: true,
                    createdAt: true,
                },
            },
            companyOnboarding: {
                select: {
                    id: true,
                    companyName: true,
                    companyType: true,
                    isApproved: true,
                    createdAt: true,
                },
            },
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
            deposits: {
                where: { transactionStatus: "PENDING" },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: {
                    id: true,
                    amount: true,
                    transactionStatus: true,
                    createdAt: true,
                },
            },
            withdrawals: {
                where: { transactionStatus: "PENDING" },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: {
                    id: true,
                    amount: true,
                    transactionStatus: true,
                    createdAt: true,
                },
            },
            userPortfolios: {
                select: {
                    id: true,
                    customName: true,
                    portfolioValue: true,
                    totalInvested: true,
                    totalLossGain: true,
                    isActive: true,
                    portfolio: true,
                    userAssets: {
                        select: {
                            id: true,
                            allocationPercentage: true,
                            costPerShare: true,
                            costPrice: true,
                            stock: true,
                            closeValue: true,
                            lossGain: true,
                            asset: true,
                        },
                    },
                },
            },
        },
    },
};
function createStaffMember(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const { email, phone, password, firstName, lastName, imageUrl, role, department, position, bio, employeeId, createdById, } = req.body;
        try {
            if (!email || !phone || !password || !firstName) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    message: "Missing required fields: email, phone, password, firstName.",
                    errors: {},
                });
            }
            const roleValue = role && isStaffRole(role) ? role : client_1.UserRole.STAFF;
            if (roleValue === client_1.UserRole.USER) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    message: "Use the /register endpoint to create client accounts.",
                    errors: { role: "Invalid staff role." },
                });
            }
            const emailNorm = email.trim().toLowerCase();
            const phoneNorm = phone.trim();
            const displayName = (lastName === null || lastName === void 0 ? void 0 : lastName.trim())
                ? `${firstName.trim()} ${lastName.trim()}`
                : firstName.trim();
            const [existingEmail, existingPhone] = yield Promise.all([
                db_1.db.user.findUnique({ where: { email: emailNorm }, select: { id: true } }),
                db_1.db.user.findUnique({ where: { phone: phoneNorm }, select: { id: true } }),
            ]);
            if (existingEmail && existingPhone) {
                return res.status(409).json({
                    success: false,
                    data: null,
                    message: "Email and phone are already registered.",
                    errors: {
                        email: "Email address is already registered",
                        phone: "Phone number is already registered",
                    },
                });
            }
            if (existingEmail) {
                return res.status(409).json({
                    success: false,
                    data: null,
                    message: "Email address is already registered.",
                    errors: { email: "Email address is already registered" },
                });
            }
            if (existingPhone) {
                return res.status(409).json({
                    success: false,
                    data: null,
                    message: "Phone number is already registered.",
                    errors: { phone: "Phone number is already registered" },
                });
            }
            if (employeeId) {
                const existingEmpId = yield db_1.db.staffProfile.findUnique({
                    where: { employeeId },
                    select: { id: true },
                });
                if (existingEmpId) {
                    return res.status(409).json({
                        success: false,
                        data: null,
                        message: "Employee ID is already in use.",
                        errors: { employeeId: "Employee ID already exists" },
                    });
                }
            }
            const hashedPassword = yield bcryptjs_1.default.hash(password, 12);
            const verificationCode = makeSixDigitToken();
            const newStaff = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                return tx.user.create({
                    data: {
                        email: emailNorm,
                        phone: phoneNorm,
                        firstName: firstName.trim(),
                        lastName: (lastName === null || lastName === void 0 ? void 0 : lastName.trim()) || "",
                        name: displayName,
                        imageUrl,
                        password: hashedPassword,
                        role: roleValue,
                        status: client_1.UserStatus.ACTIVE,
                        emailVerified: false,
                        isApproved: true,
                        token: verificationCode,
                        staffProfile: {
                            create: {
                                employeeId: employeeId !== null && employeeId !== void 0 ? employeeId : undefined,
                                department: department !== null && department !== void 0 ? department : undefined,
                                position: position !== null && position !== void 0 ? position : undefined,
                                bio: bio !== null && bio !== void 0 ? bio : undefined,
                                isActive: true,
                                createdById: createdById !== null && createdById !== void 0 ? createdById : undefined,
                            },
                        },
                    },
                    select: staffSelect,
                });
            }));
            try {
                yield (0, mailer_1.sendVerificationCodeResend)({
                    to: newStaff.email,
                    name: (_b = (_a = newStaff.firstName) !== null && _a !== void 0 ? _a : newStaff.name) !== null && _b !== void 0 ? _b : "there",
                    code: verificationCode,
                });
            }
            catch (emailError) {
                console.error("Failed to send staff welcome email:", emailError);
            }
            return res.status(201).json({
                success: true,
                data: newStaff,
                message: "Staff member created successfully.",
                errors: {},
            });
        }
        catch (error) {
            console.error("Error creating staff member:", error);
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({
                    success: false,
                    data: null,
                    message: "Email, phone, or employee ID already in use.",
                    errors: {},
                });
            }
            return res.status(500).json({
                success: false,
                data: null,
                message: "Something went wrong. Please try again.",
                errors: {},
            });
        }
    });
}
function getAllStaff(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { role, department, isActive } = req.query;
            const staff = yield db_1.db.user.findMany({
                where: Object.assign({ staffProfile: { isNot: null } }, (role && isStaffRole(role) ? { role: role } : {})),
                orderBy: { createdAt: "desc" },
                select: Object.assign(Object.assign({}, staffSelect), { staffProfile: {
                        select: {
                            id: true,
                            employeeId: true,
                            department: true,
                            position: true,
                            bio: true,
                            isActive: true,
                            createdById: true,
                            createdAt: true,
                            updatedAt: true,
                            _count: {
                                select: { assignedClients: true },
                            },
                        },
                        where: Object.assign(Object.assign({}, (department ? { department } : {})), (isActive !== undefined ? { isActive: isActive === "true" } : {})),
                    } }),
            });
            const filtered = staff.filter((s) => s.staffProfile !== null);
            return res.status(200).json({ success: true, data: filtered, error: null });
        }
        catch (error) {
            console.error("Error fetching staff:", error);
            return res
                .status(500)
                .json({ success: false, data: null, error: "Failed to fetch staff members." });
        }
    });
}
function getStaffById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            const staff = yield db_1.db.user.findUnique({
                where: { id },
                select: Object.assign(Object.assign({}, staffSelect), { staffProfile: {
                        select: {
                            id: true,
                            employeeId: true,
                            department: true,
                            position: true,
                            bio: true,
                            isActive: true,
                            createdById: true,
                            createdAt: true,
                            updatedAt: true,
                            assignedClients: {
                                where: { isActive: true },
                                select: assignedClientSelect,
                                orderBy: { assignedAt: "desc" },
                            },
                        },
                    } }),
            });
            if (!staff) {
                return res
                    .status(404)
                    .json({ success: false, data: null, error: "Staff member not found." });
            }
            if (!staff.staffProfile) {
                return res
                    .status(404)
                    .json({ success: false, data: null, error: "This user is not a staff member." });
            }
            return res.status(200).json({ success: true, data: staff, error: null });
        }
        catch (error) {
            console.error("Error fetching staff by ID:", error);
            return res.status(500).json({ success: false, data: null, error: "Server error." });
        }
    });
}
function updateStaffMember(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const { id } = req.params;
        const { firstName, lastName, email, phone, role, status, imageUrl, department, position, bio, employeeId, isActive, } = req.body;
        try {
            const existing = yield db_1.db.user.findUnique({
                where: { id },
                include: { staffProfile: { select: { id: true } } },
            });
            if (!existing) {
                return res
                    .status(404)
                    .json({ success: false, data: null, error: "User not found." });
            }
            if (!existing.staffProfile) {
                return res
                    .status(400)
                    .json({ success: false, data: null, error: "This user is not a staff member." });
            }
            if (email || phone) {
                const emailNorm = email === null || email === void 0 ? void 0 : email.trim().toLowerCase();
                const phoneNorm = phone === null || phone === void 0 ? void 0 : phone.trim();
                const conflict = yield db_1.db.user.findFirst({
                    where: {
                        OR: [
                            ...(emailNorm ? [{ email: emailNorm }] : []),
                            ...(phoneNorm ? [{ phone: phoneNorm }] : []),
                        ],
                        NOT: { id },
                    },
                    select: { id: true },
                });
                if (conflict) {
                    return res.status(409).json({
                        success: false,
                        data: null,
                        error: "Email or phone already in use by another user.",
                    });
                }
            }
            if (employeeId) {
                const empConflict = yield db_1.db.staffProfile.findFirst({
                    where: { employeeId, NOT: { userId: id } },
                    select: { id: true },
                });
                if (empConflict) {
                    return res.status(409).json({
                        success: false,
                        data: null,
                        error: "Employee ID is already in use.",
                    });
                }
            }
            const nextFirst = (_a = firstName === null || firstName === void 0 ? void 0 : firstName.trim()) !== null && _a !== void 0 ? _a : existing.firstName;
            const nextLast = lastName !== undefined
                ? (_b = lastName === null || lastName === void 0 ? void 0 : lastName.trim()) !== null && _b !== void 0 ? _b : ""
                : (_c = existing.lastName) !== null && _c !== void 0 ? _c : "";
            const nextName = nextLast
                ? `${nextFirst} ${nextLast}`.trim()
                : nextFirst;
            const updated = yield db_1.db.user.update({
                where: { id },
                data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ firstName: nextFirst, lastName: nextLast, name: nextName }, (email ? { email: email.trim().toLowerCase() } : {})), (phone ? { phone: phone.trim() } : {})), (role && isStaffRole(role) ? { role: role } : {})), (status ? { status: status } : {})), (imageUrl !== undefined ? { imageUrl } : {})), { staffProfile: {
                        update: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (department !== undefined ? { department } : {})), (position !== undefined ? { position } : {})), (bio !== undefined ? { bio } : {})), (employeeId !== undefined ? { employeeId } : {})), (isActive !== undefined ? { isActive } : {})),
                    } }),
                select: staffSelect,
            });
            return res.status(200).json({ success: true, data: updated, error: null });
        }
        catch (error) {
            console.error("Error updating staff member:", error);
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({
                    success: false,
                    data: null,
                    error: "Email, phone, or employee ID already in use.",
                });
            }
            return res
                .status(500)
                .json({ success: false, data: null, error: "Failed to update staff member." });
        }
    });
}
function deactivateStaffMember(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            const existing = yield db_1.db.user.findUnique({
                where: { id },
                include: { staffProfile: { select: { id: true } } },
            });
            if (!existing) {
                return res
                    .status(404)
                    .json({ success: false, data: null, error: "User not found." });
            }
            if (!existing.staffProfile) {
                return res
                    .status(400)
                    .json({ success: false, data: null, error: "This user is not a staff member." });
            }
            yield db_1.db.$transaction([
                db_1.db.user.update({
                    where: { id },
                    data: { status: client_1.UserStatus.INACTIVE },
                }),
                db_1.db.staffProfile.update({
                    where: { userId: id },
                    data: { isActive: false },
                }),
            ]);
            return res.status(200).json({
                success: true,
                data: null,
                message: "Staff member deactivated successfully.",
            });
        }
        catch (error) {
            console.error("Error deactivating staff member:", error);
            return res
                .status(500)
                .json({ success: false, data: null, error: "Failed to deactivate staff member." });
        }
    });
}
function getAgentClients(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        const { includeInactive } = req.query;
        try {
            const staffProfile = yield db_1.db.staffProfile.findUnique({
                where: { userId: id },
                select: { id: true },
            });
            if (!staffProfile) {
                return res
                    .status(404)
                    .json({ success: false, data: null, error: "Staff member not found." });
            }
            const assignments = yield db_1.db.agentClientAssignment.findMany({
                where: Object.assign({ agentId: staffProfile.id }, (includeInactive === "true" ? {} : { isActive: true })),
                select: assignedClientSelect,
                orderBy: { assignedAt: "desc" },
            });
            return res.status(200).json({ success: true, data: assignments, error: null });
        }
        catch (error) {
            console.error("Error fetching agent clients:", error);
            return res
                .status(500)
                .json({ success: false, data: null, error: "Failed to fetch agent clients." });
        }
    });
}
function assignClientToAgent(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        const { clientId, assignedById } = req.body;
        try {
            if (!clientId) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    message: "clientId is required.",
                    errors: { clientId: "Please provide a client ID." },
                });
            }
            const staffProfile = yield db_1.db.staffProfile.findUnique({
                where: { userId: id },
                select: { id: true, isActive: true },
            });
            if (!staffProfile) {
                return res
                    .status(404)
                    .json({ success: false, data: null, error: "Staff member not found." });
            }
            if (!staffProfile.isActive) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "Cannot assign clients to an inactive staff member.",
                });
            }
            const client = yield db_1.db.user.findUnique({
                where: { id: clientId },
                select: { id: true, role: true, staffProfile: { select: { id: true } } },
            });
            if (!client) {
                return res
                    .status(404)
                    .json({ success: false, data: null, error: "Client not found." });
            }
            if (client.staffProfile) {
                return res.status(400).json({
                    success: false,
                    data: null,
                    error: "Cannot assign a staff member as a client.",
                });
            }
            const existingAssignment = yield db_1.db.agentClientAssignment.findUnique({
                where: { clientId },
                select: { id: true, agentId: true, isActive: true },
            });
            const now = new Date();
            const assignment = yield db_1.db.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                if (existingAssignment) {
                    return tx.agentClientAssignment.update({
                        where: { id: existingAssignment.id },
                        data: {
                            agentId: staffProfile.id,
                            isActive: true,
                            unassignedAt: null,
                            assignedAt: now,
                            assignedById: assignedById !== null && assignedById !== void 0 ? assignedById : null,
                        },
                        select: assignedClientSelect,
                    });
                }
                return tx.agentClientAssignment.create({
                    data: {
                        agentId: staffProfile.id,
                        clientId,
                        assignedById: assignedById !== null && assignedById !== void 0 ? assignedById : null,
                        isActive: true,
                    },
                    select: assignedClientSelect,
                });
            }));
            return res.status(201).json({
                success: true,
                data: assignment,
                message: "Client assigned to agent successfully.",
            });
        }
        catch (error) {
            console.error("Error assigning client to agent:", error);
            if ((error === null || error === void 0 ? void 0 : error.code) === "P2002") {
                return res.status(409).json({
                    success: false,
                    data: null,
                    error: "This client is already assigned to this agent.",
                });
            }
            return res
                .status(500)
                .json({ success: false, data: null, error: "Failed to assign client." });
        }
    });
}
function unassignClientFromAgent(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id, clientId } = req.params;
        try {
            const staffProfile = yield db_1.db.staffProfile.findUnique({
                where: { userId: id },
                select: { id: true },
            });
            if (!staffProfile) {
                return res
                    .status(404)
                    .json({ success: false, data: null, error: "Staff member not found." });
            }
            const assignment = yield db_1.db.agentClientAssignment.findFirst({
                where: { agentId: staffProfile.id, clientId, isActive: true },
                select: { id: true },
            });
            if (!assignment) {
                return res.status(404).json({
                    success: false,
                    data: null,
                    error: "No active assignment found for this client and agent.",
                });
            }
            yield db_1.db.agentClientAssignment.update({
                where: { id: assignment.id },
                data: { isActive: false, unassignedAt: new Date() },
            });
            return res.status(200).json({
                success: true,
                data: null,
                message: "Client unassigned from agent successfully.",
            });
        }
        catch (error) {
            console.error("Error unassigning client:", error);
            return res
                .status(500)
                .json({ success: false, data: null, error: "Failed to unassign client." });
        }
    });
}
function getAgentForClient(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { clientId } = req.params;
        try {
            const assignment = yield db_1.db.agentClientAssignment.findUnique({
                where: { clientId },
                select: {
                    id: true,
                    assignedAt: true,
                    isActive: true,
                    agent: {
                        select: {
                            id: true,
                            userId: true,
                            position: true,
                            department: true,
                            user: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    name: true,
                                    email: true,
                                    phone: true,
                                    imageUrl: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            });
            if (!assignment || !assignment.isActive) {
                return res.status(404).json({
                    success: false,
                    data: null,
                    error: "No agent currently assigned to this client.",
                });
            }
            return res.status(200).json({ success: true, data: assignment, error: null });
        }
        catch (error) {
            console.error("Error fetching agent for client:", error);
            return res.status(500).json({ success: false, data: null, error: "Server error." });
        }
    });
}
function hardDeleteStaffMember(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id } = req.params;
        try {
            const existing = yield db_1.db.user.findUnique({
                where: { id },
                include: { staffProfile: { select: { id: true } } },
            });
            if (!existing) {
                return res.status(404).json({ success: false, data: null, error: "User not found." });
            }
            if (!existing.staffProfile) {
                return res.status(400).json({ success: false, data: null, error: "This user is not a staff member." });
            }
            yield db_1.db.agentClientAssignment.updateMany({
                where: { agentId: existing.staffProfile.id, isActive: true },
                data: { isActive: false, unassignedAt: new Date() },
            });
            yield db_1.db.user.delete({ where: { id } });
            return res.status(200).json({
                success: true,
                data: null,
                message: "Staff member permanently deleted.",
            });
        }
        catch (error) {
            console.error("Error deleting staff member:", error);
            return res.status(500).json({ success: false, data: null, error: "Failed to delete staff member." });
        }
    });
}
