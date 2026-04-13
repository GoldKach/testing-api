"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AccountVerifiedEmail;
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
function AccountVerifiedEmail({ name = "there", }) {
    return (React.createElement(components_1.Html, null,
        React.createElement(components_1.Body, { style: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", backgroundColor: "#f9fafb" } },
            React.createElement(components_1.Container, { style: { maxWidth: 560, margin: "32px auto", padding: 0, borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb" } },
                React.createElement(components_1.Section, { style: { backgroundColor: "#f8f8f9", padding: "32px 24px", textAlign: "center" } },
                    React.createElement(components_1.Link, { href: "https://goldkach.co.ug", target: "_blank", rel: "noopener noreferrer" },
                        React.createElement(components_1.Img, { src: "https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf", alt: "Goldkach", width: 80, height: 80, style: { display: "block", margin: "0 auto" } }))),
                React.createElement(components_1.Section, { style: { backgroundColor: "#ffffff", padding: "32px 32px 24px" } },
                    React.createElement(components_1.Section, { style: { textAlign: "center", marginBottom: 24 } },
                        React.createElement(components_1.Text, { style: { fontSize: 48, margin: 0 } }, "\uD83C\uDF89")),
                    React.createElement(components_1.Heading, { style: { fontSize: 22, fontWeight: 700, color: "#111827", textAlign: "center", margin: "0 0 16px" } }, "Your Email Has Been Verified!"),
                    React.createElement(components_1.Text, { style: { color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" } },
                        "Hi ",
                        name,
                        ","),
                    React.createElement(components_1.Text, { style: { color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" } },
                        "Great news \u2014 your email address has been successfully verified. Your",
                        " ",
                        React.createElement("strong", null, "GoldKach Investment"),
                        " account is now active and ready to use."),
                    React.createElement(components_1.Section, { style: {
                            backgroundColor: "#E6F4FF",
                            border: "1px solid #1E90FF",
                            borderRadius: 10,
                            padding: "16px 20px",
                            margin: "20px 0",
                        } },
                        React.createElement(components_1.Text, { style: { color: "#1E3A8A", fontSize: 14, fontWeight: 600, margin: "0 0 10px" } }, "\uD83D\uDE80 Get Started in 2 Steps"),
                        React.createElement(components_1.Text, { style: { color: "#1E3A8A", fontSize: 14, margin: "0 0 8px", lineHeight: "22px" } },
                            React.createElement("strong", null, "Step 1 \u2014 Make a Deposit"),
                            React.createElement("br", null),
                            "Log in to your account and make your first deposit using your preferred payment method."),
                        React.createElement(components_1.Text, { style: { color: "#1E3A8A", fontSize: 14, margin: 0, lineHeight: "22px" } },
                            React.createElement("strong", null, "Step 2 \u2014 Get Allocated to a Portfolio"),
                            React.createElement("br", null),
                            "Once your deposit is received and confirmed, our team will allocate you to one or more investment portfolios tailored to your goals and risk profile.")),
                    React.createElement(components_1.Section, { style: {
                            backgroundColor: "#F3F4F6",
                            border: "1px solid #D1D5DB",
                            borderRadius: 10,
                            padding: "16px 20px",
                            margin: "20px 0",
                        } },
                        React.createElement(components_1.Text, { style: { color: "#374151", fontSize: 14, fontWeight: 600, margin: "0 0 6px" } }, "\uD83D\uDCA1 Good to Know"),
                        React.createElement(components_1.Text, { style: { color: "#4B5563", fontSize: 14, margin: 0, lineHeight: "22px" } }, "Your assigned agent will guide you through the deposit process and keep you informed about your portfolio performance. Don't hesitate to reach out to them with any questions.")),
                    React.createElement(components_1.Text, { style: { color: "#6b7280", fontSize: 14, lineHeight: "22px", margin: "20px 0 0" } },
                        "Need help? Contact us at",
                        " ",
                        React.createElement(components_1.Link, { href: "mailto:itsupport@goldkach.co.ug", style: { color: "#1E90FF" } }, "itsupport@goldkach.co.ug"),
                        ".")),
                React.createElement(components_1.Section, { style: { backgroundColor: "#ffffff", padding: "0 32px 32px", textAlign: "center" } },
                    React.createElement(components_1.Button, { href: "https://goldkach.co.ug/login", style: {
                            backgroundColor: "#1E90FF",
                            color: "#ffffff",
                            fontSize: 15,
                            fontWeight: 600,
                            borderRadius: 8,
                            padding: "12px 32px",
                            textDecoration: "none",
                            display: "inline-block",
                        } }, "Log In & Make a Deposit")),
                React.createElement(components_1.Section, { style: { backgroundColor: "#f3f4f6", padding: "16px 24px", textAlign: "center" } },
                    React.createElement(components_1.Hr, { style: { borderColor: "#e5e7eb", margin: "0 0 12px" } }),
                    React.createElement(components_1.Text, { style: { color: "#9ca3af", fontSize: 12, margin: 0 } },
                        "\u00A9 ",
                        new Date().getFullYear(),
                        " GoldKach Investment. All rights reserved."),
                    React.createElement(components_1.Text, { style: { color: "#9ca3af", fontSize: 12, margin: "4px 0 0" } }, "3rd Floor, Kanjokya House, Suite F3 - F4 Plot 90, Kanjokya Street P.O.Box 500094 Kampala, Uganda +256 200903314 / +256 393246074"))))));
}
