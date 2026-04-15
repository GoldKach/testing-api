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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const resend_1 = require("resend");
const router = (0, express_1.Router)();
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || "Goldkach <info@goldkach.co.ug>";
const resend = new resend_1.Resend(RESEND_API_KEY);
router.post("/send-email", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { recipients, subject, body } = req.body;
        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ success: false, error: "Recipients are required" });
        }
        if (!subject) {
            return res.status(400).json({ success: false, error: "Subject is required" });
        }
        if (!body) {
            return res.status(400).json({ success: false, error: "Body is required" });
        }
        let sentCount = 0;
        let failedCount = 0;
        const errors = [];
        const brandedHtml = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 24px auto; padding: 24px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e0e0e0;">
          <div style="text-align: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 2px solid #2B2F77;">
            <a href="https://goldkach.co.ug" target="_blank" style="text-decoration: none;">
              <img src="https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf" alt="Goldkach" width="100" height="100" style="display: block; margin: 0 auto;" />
            </a>
            <p style="margin-top: 12px; margin-bottom: 0; font-size: 18px; font-weight: 700; color: #2B2F77;">GoldKach Limited</p>
          </div>
          
          <div style="padding: 0 8px;">
            ${body}
          </div>
          
          <hr style="margin-top: 24px; margin-bottom: 16px; border-top: 1px solid #e0e0e0;" />
          
          <div style="text-align: center; font-size: 12px; color: #777;">
            <p style="margin: 4px 0;">
              <a href="https://goldkach.co.ug" style="color: #2B2F77; text-decoration: none;">Website</a>
              &nbsp;•&nbsp;
              <a href="mailto:info@goldkach.co.ug" style="color: #2B2F77; text-decoration: none;">Contact Us</a>
            </p>
            <p style="margin: 4px 0;">Tel: +256 200 903314 / +256 393 246074</p>
            <p style="margin: 4px 0;">3rd Floor, Kanjokya House, Plot 90, Kanjokya Street, Kampala, Uganda</p>
            <p style="margin-top: 12px; color: #aaa;">© ${new Date().getFullYear()} GoldKach Limited. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
        for (const to of recipients) {
            try {
                const { data, error } = yield resend.emails.send({
                    from: FROM,
                    to,
                    subject,
                    html: brandedHtml,
                });
                if (error) {
                    failedCount++;
                    errors.push(`${to}: ${error.message}`);
                }
                else {
                    sentCount++;
                }
            }
            catch (err) {
                failedCount++;
                errors.push(`${to}: ${err}`);
            }
        }
        return res.status(200).json({
            success: true,
            sent: sentCount,
            failed: failedCount,
            errors: errors.length > 0 ? errors : undefined,
        });
    }
    catch (error) {
        console.error("Send email error:", error);
        return res.status(500).json({ success: false, error: "Server error" });
    }
}));
exports.default = router;
