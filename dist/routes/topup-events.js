"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const topup_events_1 = require("../controllers/topup-events");
const topupEventsRouter = (0, express_1.Router)();
topupEventsRouter.get("/topup-events", topup_events_1.listTopupEvents);
topupEventsRouter.get("/topup-events/portfolio/:userPortfolioId", topup_events_1.getTopupTimeline);
topupEventsRouter.get("/topup-events/:id", topup_events_1.getTopupEventById);
exports.default = topupEventsRouter;
