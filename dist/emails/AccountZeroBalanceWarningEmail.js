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
exports.default = AccountZeroBalanceWarningEmail;
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
function AccountZeroBalanceWarningEmail({ name = "there", daysRemaining = 7, }) {
    return (React.createElement(components_1.Html, null,
        React.createElement(components_1.Body, { style: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", backgroundColor: "#f9fafb" } },
            React.createElement(components_1.Container, { style: { maxWidth: 560, margin: "32px auto", padding: 0, borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb" } },
                React.createElement(components_1.Section, { style: { backgroundColor: "#f8f8f9", padding: "32px 24px", textAlign: "center" } },
                    React.createElement(components_1.Link, { href: "https://goldkach.co.ug", target: "_blank", rel: "noopener noreferrer" },
                        React.createElement(components_1.Img, { src: "https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf", alt: "Goldkach", width: 80, height: 80, style: { display: "block", margin: "0 auto" } }))),
                React.createElement(components_1.Section, { style: { backgroundColor: "#ffffff", padding: "32px 32px 24px" } },
                    React.createElement(components_1.Section, { style: { textAlign: "center", marginBottom: 24 } },
                        React.createElement(components_1.Text, { style: { fontSize: 48, margin: 0 } }, "\u23F0")),
                    React.createElement(components_1.Heading, { style: { fontSize: 22, fontWeight: 700, color: "#111827", textAlign: "center", margin: "0 0 16px" } }, "Your Account Will Be Deactivated Soon"),
                    React.createElement(components_1.Text, { style: { color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" } },
                        "Hi ",
                        name,
                        ","),
                    React.createElement(components_1.Text, { style: { color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" } },
                        "We noticed your account currently has a ",
                        React.createElement("strong", null, "zero balance"),
                        " across all your wallets. Your account will be ",
                        React.createElement("strong", null,
                            "deactivated in ",
                            daysRemaining,
                            " days"),
                        " if no deposit is made."),
                    React.createElement(components_1.Section, { style: {
                            backgroundColor: "#FEF3C7",
                            border: "1px solid #F59E0B",
                            borderRadius: 10,
                            padding: "16px 20px",
                            margin: "20px 0",
                        } },
                        React.createElement(components_1.Text, { style: { color: "#92400E", fontSize: 14, fontWeight: 600, margin: "0 0 10px" } }, "What happens if my account is deactivated?"),
                        React.createElement(components_1.Text, { style: { color: "#92400E", fontSize: 14, margin: "0 0 8px", lineHeight: "22px" } }, "Once deactivated, you won't be able to access your account until you contact our support team to request reactivation. All your portfolio data will be preserved.")),
                    React.createElement(components_1.Section, { style: {
                            backgroundColor: "#D1FAE5",
                            border: "1px solid #10B981",
                            borderRadius: 10,
                            padding: "16px 20px",
                            margin: "20px 0",
                        } },
                        React.createElement(components_1.Text, { style: { color: "#065F46", fontSize: 14, fontWeight: 600, margin: "0 0 10px" } }, "How to avoid deactivation?"),
                        React.createElement(components_1.Text, { style: { color: "#065F46", fontSize: 14, margin: 0, lineHeight: "22px" } }, "Simply make a deposit to any of your wallets before the deadline. Even a small deposit will reset the timer and keep your account active.")),
                    React.createElement(components_1.Text, { style: { color: "#6b7280", fontSize: 14, lineHeight: "22px", margin: "20px 0 0" } },
                        "Need help? Contact us at",
                        " ",
                        React.createElement(components_1.Link, { href: "mailto:itsupport@goldkach.co.ug", style: { color: "#1E90FF" } }, "itsupport@goldkach.co.ug"),
                        " ",
                        "or call us at +256 200903314 / +256 393246074.")),
                React.createElement(components_1.Section, { style: { backgroundColor: "#ffffff", padding: "0 32px 32px", textAlign: "center" } },
                    React.createElement(components_1.Button, { href: "https://goldkach.co.ug/dashboard/deposit", style: {
                            backgroundColor: "#10B981",
                            color: "#ffffff",
                            fontSize: 15,
                            fontWeight: 600,
                            borderRadius: 8,
                            padding: "12px 32px",
                            textDecoration: "none",
                            display: "inline-block",
                        } }, "Make a Deposit")),
                React.createElement(components_1.Section, { style: { backgroundColor: "#f3f4f6", padding: "16px 24px", textAlign: "center" } },
                    React.createElement(components_1.Hr, { style: { borderColor: "#e5e7eb", margin: "0 0 12px" } }),
                    React.createElement(components_1.Text, { style: { color: "#9ca3af", fontSize: 12, margin: 0 } },
                        "\u00A9 ",
                        new Date().getFullYear(),
                        " GoldKach Investment. All rights reserved."),
                    React.createElement(components_1.Text, { style: { color: "#9ca3af", fontSize: 12, margin: "4px 0 0" } }, "3rd Floor, Kanjokya House, Suite F3 - F4 Plot 90, Kanjokya Street P.O.Box 500094 Kampala, Uganda"))))));
}
