// src/utils/recaptcha.ts
import axios from "axios";

interface RecaptchaResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

interface RecaptchaResult {
  success: boolean;
  error?: string;
}

/**
 * Verify reCAPTCHA token with Google's API
 */
export async function verifyRecaptcha(token: string): Promise<RecaptchaResult> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;

  if (!secretKey) {
    console.error("⚠️ RECAPTCHA_SECRET_KEY not set in .env");
    return {
      success: false,
      error: "Server configuration error",
    };
  }

  if (!token || token.trim() === "") {
    return {
      success: false,
      error: "reCAPTCHA token is required",
    };
  }

  try {
    const response = await axios.post<RecaptchaResponse>(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: secretKey,
          response: token,
        },
        timeout: 5000,
      }
    );

    if (!response.data.success) {
      console.error("❌ reCAPTCHA verification failed:", response.data["error-codes"]);
      return {
        success: false,
        error: "reCAPTCHA verification failed. Please try again.",
      };
    }

    console.log("✅ reCAPTCHA verification successful");
    return { success: true };
  } catch (error: any) {
    console.error("❌ Error verifying reCAPTCHA:", error.message);
    return {
      success: false,
      error: "Failed to verify reCAPTCHA. Please try again.",
    };
  }
}