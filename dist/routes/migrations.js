"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const migrations_1 = require("../controllers/migrations");
const express_1 = require("express");
const migrationsRouter = (0, express_1.Router)();
migrationsRouter.post("/migrations/backfill-portfolios", migrations_1.backfillPortfoliosToNewStructure);
migrationsRouter.post("/migrations/reactivate-all-users", migrations_1.reactivateAllUsers);
exports.default = migrationsRouter;
