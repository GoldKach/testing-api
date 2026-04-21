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
exports.default = ResetPasswordEmail;
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
function ResetPasswordEmail({ name = "there", resetUrl }) {
    const year = new Date().getFullYear();
    return (React.createElement(components_1.Html, null,
        React.createElement(components_1.Head, null),
        React.createElement(components_1.Preview, null, "Reset your Goldkach password (link expires in 30 minutes)"),
        React.createElement(components_1.Body, { style: {
                margin: 0,
                fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, sans-serif',
                backgroundColor: "#f8f9fb",
                color: "#111",
            } },
            React.createElement(components_1.Container, { style: {
                    maxWidth: 560,
                    margin: "24px auto",
                    background: "#fff",
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 24,
                } },
                React.createElement(components_1.Section, { style: { textAlign: "center", marginBottom: 16 } },
                    React.createElement(components_1.Link, { href: "goldkach.co.ug", target: "_blank", rel: "noopener noreferrer" },
                        React.createElement(components_1.Img, { src: "https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf", alt: "Goldkach", width: 120, height: 120, style: { display: "block", margin: "0 auto" } }))),
                React.createElement(components_1.Text, { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, "Reset your password"),
                React.createElement(components_1.Text, { style: { color: "#555", marginTop: 8 } },
                    "Hi ",
                    name,
                    ", click the button below to set a new password. This link expires in 30 minutes."),
                React.createElement(components_1.Section, { style: { margin: "20px 0" } },
                    React.createElement(components_1.Button, { href: resetUrl, target: "_blank", rel: "noopener noreferrer", style: {
                            display: "inline-block",
                            background: "#111",
                            color: "#fff",
                            padding: "12px 16px",
                            borderRadius: 8,
                            textDecoration: "none",
                            fontWeight: 600,
                        } }, "Reset password")),
                React.createElement(components_1.Text, { style: { color: "#777", fontSize: 12 } },
                    "If the button doesn\u2019t work, copy and paste this link into your browser:",
                    React.createElement("br", null),
                    React.createElement("a", { href: resetUrl, target: "_blank", rel: "noopener noreferrer", style: { color: "#0a66c2", wordBreak: "break-all" } }, resetUrl)),
                React.createElement(components_1.Hr, { style: { borderColor: "#eee", margin: "16px 0" } }),
                React.createElement(components_1.Text, { style: { color: "#888", fontSize: 12, marginTop: 0 } }, "If you didn\u2019t request this, you can safely ignore this email."),
                React.createElement(components_1.Text, { style: { color: "#aaa", fontSize: 12, marginTop: 8 } },
                    "\u00A9 ",
                    year,
                    " Goldkach")))));
}
