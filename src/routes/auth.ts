

// routes/auth.ts
import {
  forgotPassword,
  resendVerification,
  resetPassword,
  verifyEmail,
  refreshToken,
} from "@/controllers/auth";
import { initiateLogin, resendLoginCode, verifyLoginCode } from "@/controllers/auth-controller-2fa";
import { Router } from "express";

const authRouter = Router();

/* ======================
   2FA LOGIN FLOW
====================== */
// Step 1: Send verification code
authRouter.post("/auth/login", initiateLogin);

// Step 2: Verify code and complete login
authRouter.post("/auth/login/verify", verifyLoginCode);

// Resend login verification code
authRouter.post("/auth/login/resend-code", resendLoginCode);

/* ======================
   PASSWORD RESET FLOW
====================== */
authRouter.post("/auth/forgot-password", forgotPassword);
authRouter.post("/auth/reset-password", resetPassword);

/* ======================
   EMAIL VERIFICATION (Registration)
====================== */
authRouter.post("/auth/verify-email", verifyEmail);
authRouter.post("/auth/resend-verification", resendVerification);
authRouter.post("/refresh-token", refreshToken);

export default authRouter;