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
exports.default = VerificationCodeEmail;
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
function VerificationCodeEmail({ name = "there", code, }) {
    return (React.createElement(components_1.Html, null,
        React.createElement(components_1.Body, { style: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" } },
            React.createElement(components_1.Container, { style: { maxWidth: 560, margin: "24px auto", padding: 24, border: "1px solid #eee", borderRadius: 12 } },
                React.createElement(components_1.Section, { style: { textAlign: "center", marginBottom: 16 } },
                    React.createElement(components_1.Link, { href: "goldkach.co.ug", target: "_blank", rel: "noopener noreferrer" },
                        React.createElement(components_1.Img, { src: "https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf", alt: "Goldkach", width: 120, height: 120, style: { display: "block", margin: "0 auto" } }))),
                React.createElement(components_1.Text, { style: { fontSize: 20, fontWeight: 600, marginBottom: 8 } }, "Verify your email"),
                React.createElement(components_1.Text, { style: { color: "#555" } },
                    "Hi ",
                    name,
                    ", here is your 6-digit verification code:"),
                React.createElement(components_1.Text, { style: { fontSize: 28, letterSpacing: 4, margin: "12px 0", fontWeight: 700 } }, code),
                React.createElement(components_1.Text, { style: { color: "#777", fontSize: 12 } }, "If you didn\u2019t create an account, you can ignore this email."),
                React.createElement(components_1.Hr, null),
                React.createElement(components_1.Text, { style: { color: "#aaa", fontSize: 12 } },
                    "\u00A9 ",
                    new Date().getFullYear(),
                    " Goldkach")))));
}
