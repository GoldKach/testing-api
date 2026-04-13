"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sub_portfolios_1 = require("../controllers/sub-portfolios");
const subPortfoliosRouter = (0, express_1.Router)();
subPortfoliosRouter.get("/sub-portfolios", sub_portfolios_1.listSubPortfolios);
subPortfoliosRouter.get("/sub-portfolios/:id", sub_portfolios_1.getSubPortfolioById);
subPortfoliosRouter.patch("/sub-portfolios/:id", sub_portfolios_1.updateSubPortfolio);
exports.default = subPortfoliosRouter;
