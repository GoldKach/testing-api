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
exports.default = LoginVerificationEmail;
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
function LoginVerificationEmail({ name = "there", code, }) {
    return (React.createElement(components_1.Html, null,
        React.createElement(components_1.Head, null),
        React.createElement(components_1.Preview, null, "Your login verification code for GoldKach"),
        React.createElement(components_1.Body, { style: main },
            React.createElement(components_1.Container, { style: container },
                React.createElement(components_1.Section, { style: header },
                    React.createElement(components_1.Heading, { style: headerText }, "\uD83D\uDD10 Login Verification")),
                React.createElement(components_1.Section, null,
                    React.createElement(components_1.Link, { href: "goldkach.co.ug", target: "_blank", rel: "noopener noreferrer" },
                        React.createElement(components_1.Img, { src: "https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf", alt: "Goldkach", width: 120, height: 120, style: { display: "block", margin: "0 auto" } }))),
                React.createElement(components_1.Section, { style: content },
                    React.createElement(components_1.Text, { style: greeting },
                        "Hi ",
                        name,
                        ","),
                    React.createElement(components_1.Text, { style: paragraph }, "We received a login attempt for your GoldKach account. To complete your login, please enter the verification code below:"),
                    React.createElement(components_1.Section, { style: codeContainer },
                        React.createElement(components_1.Text, { style: codeText }, code)),
                    React.createElement(components_1.Text, { style: expiryText },
                        "This code will expire in ",
                        React.createElement("strong", null, "10 minutes"),
                        "."),
                    React.createElement(components_1.Section, { style: warningBox },
                        React.createElement(components_1.Text, { style: warningText },
                            React.createElement("strong", null, "\u26A0\uFE0F Security Notice:"),
                            " If you didn't attempt to login, please secure your account immediately by changing your password."))),
                React.createElement(components_1.Hr, { style: hr }),
                React.createElement(components_1.Section, { style: footer },
                    React.createElement(components_1.Text, { style: footerText },
                        "\u00A9 ",
                        new Date().getFullYear(),
                        " GoldKach. All rights reserved."))))));
}
const main = {
    backgroundColor: "#f4f7fa",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};
const container = {
    backgroundColor: "#ffffff",
    margin: "40px auto",
    padding: "0",
    maxWidth: "600px",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
};
const header = {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "40px 40px 20px 40px",
    borderRadius: "8px 8px 0 0",
    textAlign: "center",
};
const headerText = {
    color: "#ffffff",
    fontSize: "28px",
    fontWeight: "600",
    margin: "0",
};
const content = {
    padding: "40px",
};
const greeting = {
    color: "#333333",
    fontSize: "16px",
    lineHeight: "1.6",
    margin: "0 0 20px 0",
};
const paragraph = {
    color: "#555555",
    fontSize: "16px",
    lineHeight: "1.6",
    margin: "0 0 30px 0",
};
const codeContainer = {
    backgroundColor: "#f8f9fa",
    border: "2px dashed #667eea",
    borderRadius: "8px",
    padding: "30px",
    textAlign: "center",
    margin: "30px 0",
};
const codeText = {
    fontSize: "36px",
    fontWeight: "bold",
    letterSpacing: "8px",
    color: "#667eea",
    fontFamily: '"Courier New", monospace',
    margin: "0",
};
const expiryText = {
    color: "#666666",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "30px 0 0 0",
};
const warningBox = {
    backgroundColor: "#fff3cd",
    borderLeft: "4px solid #ffc107",
    borderRadius: "4px",
    padding: "20px",
    marginTop: "30px",
};
const warningText = {
    color: "#856404",
    fontSize: "14px",
    lineHeight: "1.6",
    margin: "0",
};
const hr = {
    borderColor: "#e6e6e6",
    margin: "0",
};
const footer = {
    padding: "30px 40px",
    backgroundColor: "#f8f9fa",
    borderRadius: "0 0 8px 8px",
};
const footerText = {
    color: "#999999",
    fontSize: "12px",
    lineHeight: "1.6",
    textAlign: "center",
    margin: "0",
};
