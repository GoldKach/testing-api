import { Router } from "express";
import {
  listAllSessions,
  listUserSessions,
  revokeSession,
  revokeAllUserSessions,
  getSessionStats,
} from "@/controllers/sessions";

const sessionsRouter = Router();

sessionsRouter.get("/sessions/stats",               getSessionStats);
sessionsRouter.get("/sessions",                     listAllSessions);
sessionsRouter.get("/users/:userId/sessions",        listUserSessions);
sessionsRouter.delete("/sessions/:id",               revokeSession);
sessionsRouter.delete("/users/:userId/sessions",     revokeAllUserSessions);

export default sessionsRouter;
