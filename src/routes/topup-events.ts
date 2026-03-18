// src/routes/topup-events.ts
import { Router } from "express";
import {
  listTopupEvents,
  getTopupEventById,
  getTopupTimeline,
} from "@/controllers/topup-events";

const topupEventsRouter = Router();

// GET /topup-events?userPortfolioId=...&userId=...&status=...
topupEventsRouter.get("/topup-events",                            listTopupEvents);
topupEventsRouter.get("/topup-events/portfolio/:userPortfolioId", getTopupTimeline);
topupEventsRouter.get("/topup-events/:id",                        getTopupEventById);

export default topupEventsRouter;