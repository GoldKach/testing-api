// routes/auth.ts
import { forgotPassword, resendVerification, resetPassword, verifyEmail } from "@/controllers/auth";
import { Router } from "express";

const authRouter = Router();
authRouter.post("/auth/forgot-password", forgotPassword);
authRouter.post("/auth/reset-password", resetPassword);
authRouter.post("/auth/verify-email", verifyEmail);
authRouter.post("/auth/resend-verification", resendVerification);
export default authRouter;
