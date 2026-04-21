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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = OnboardingSubmittedEmail;
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
function OnboardingSubmittedEmail({ name = "there", isCompany = false, }) {
    return (React.createElement(components_1.Html, null,
        React.createElement(components_1.Body, { style: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", backgroundColor: "#f9fafb" } },
            React.createElement(components_1.Container, { style: { maxWidth: 560, margin: "32px auto", padding: 0, borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb" } },
                React.createElement(components_1.Section, { style: { backgroundColor: "#2E2A5E", padding: "32px 24px", textAlign: "center" } },
                    React.createElement(components_1.Link, { href: "https://goldkach.co.ug", target: "_blank", rel: "noopener noreferrer" },
                        React.createElement(components_1.Img, { src: "https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf", alt: "Goldkach", width: 80, height: 80, style: { display: "block", margin: "0 auto" } }))),
                React.createElement(components_1.Section, { style: { backgroundColor: "#ffffff", padding: "32px 32px 24px" } },
                    React.createElement(components_1.Section, { style: { textAlign: "center", marginBottom: 24 } },
                        React.createElement(components_1.Text, { style: { fontSize: 48, margin: 0 } }, "\u2705")),
                    React.createElement(components_1.Heading, { style: { fontSize: 22, fontWeight: 700, color: "#111827", textAlign: "center", margin: "0 0 16px" } }, "Application Submitted Successfully"),
                    React.createElement(components_1.Text, { style: { color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" } },
                        "Dear ",
                        name,
                        ","),
                    React.createElement(components_1.Text, { style: { color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" } },
                        "Thank you for completing your ",
                        isCompany ? "company" : "",
                        " onboarding application with",
                        " ",
                        React.createElement("strong", null, "GoldKach Investment"),
                        ". We have successfully received all your information and documents."),
                    React.createElement(components_1.Section, { style: {
                            backgroundColor: "#E6F4FF",
                            border: "1px solid #1E90FF",
                            borderRadius: 10,
                            padding: "16px 20px",
                            margin: "20px 0",
                        } },
                        React.createElement(components_1.Text, { style: { color: "#1E3A8A", fontSize: 14, fontWeight: 600, margin: "0 0 6px" } }, "\u23F1 Processing Time"),
                        React.createElement(components_1.Text, { style: { color: "#1E3A8A", fontSize: 14, margin: 0, lineHeight: "22px" } },
                            "Please allow up to ",
                            React.createElement("strong", null, "48 hours"),
                            " for our compliance team to review and verify your application. We may reach out if additional information is required.")),
                    React.createElement(components_1.Section, { style: {
                            backgroundColor: "#F3F4F6",
                            border: "1px solid #D1D5DB",
                            borderRadius: 10,
                            padding: "16px 20px",
                            margin: "20px 0",
                        } },
                        React.createElement(components_1.Text, { style: { color: "#374151", fontSize: 14, fontWeight: 600, margin: "0 0 6px" } }, "\uD83D\uDCE7 What Happens Next?"),
                        React.createElement(components_1.Text, { style: { color: "#4B5563", fontSize: 14, margin: 0, lineHeight: "22px" } }, "Once your account is approved, you will receive a confirmation email. You can then log in and make your first deposit to be allocated to one or more investment portfolios.")),
                    React.createElement(components_1.Text, { style: { color: "#6b7280", fontSize: 14, lineHeight: "22px", margin: "20px 0 0" } },
                        "If you have any questions in the meantime, feel free to reach out to our support team at",
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
                        } }, "Back to Login")),
                React.createElement(components_1.Section, { style: { backgroundColor: "#f3f4f6", padding: "16px 24px", textAlign: "center" } },
                    React.createElement(components_1.Hr, { style: { borderColor: "#e5e7eb", margin: "0 0 12px" } }),
                    React.createElement(components_1.Text, { style: { color: "#9ca3af", fontSize: 12, margin: 0 } },
                        "\u00A9 ",
                        new Date().getFullYear(),
                        " GoldKach Investment. All rights reserved."),
                    React.createElement(components_1.Text, { style: { color: "#9ca3af", fontSize: 12, margin: "4px 0 0" } }, "3rd Floor, Kanjokya House, Suite F3 - F4 Plot 90, Kanjokya Street P.O.Box 500094 Kampala, Uganda +256 200903314 / +256 393246074"))))));
}
