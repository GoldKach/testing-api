// src/middleware/rate-limit.ts
import rateLimit from "express-rate-limit";

// 🔹 Registration limiter (3 attempts per hour per IP)
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1, // 1 hour
  max: 20, // max 3 registration attempts
  message: {
    success: false,
    data: null,
    message: "Too many registration attempts from this IP. Please try again after 1 hour.",
    errors: {}
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Remove the handler - let the library handle the response
  // OR use the correct signature:
  handler: (req, res, next, options) => {
    res.status(429).json({
      success: false,
      data: null,
      message: "Too many registration attempts from this IP. Please try again after 1 hour.",
      errors: {}
    });
  },
});

// 🔹 Login limiter (5 attempts per 15 minutes)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    data: null,
    error: "Too many login attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});