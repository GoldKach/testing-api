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
exports.BrandedEmailLayout = BrandedEmailLayout;
const React = __importStar(require("react"));
const components_1 = require("@react-email/components");
function BrandedEmailLayout({ children }) {
    return (React.createElement(components_1.Html, null,
        React.createElement(components_1.Body, { style: { fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", backgroundColor: "#f5f5f5" } },
            React.createElement(components_1.Container, { style: { maxWidth: 600, margin: "24px auto", padding: 24, backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e0e0e0" } },
                React.createElement(components_1.Section, { style: { textAlign: "center", marginBottom: 20, paddingBottom: 20, borderBottom: "2px solid #2B2F77" } },
                    React.createElement(components_1.Link, { href: "https://goldkach.co.ug", target: "_blank", rel: "noopener noreferrer" },
                        React.createElement(components_1.Img, { src: "https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf", alt: "Goldkach", width: 100, height: 100, style: { display: "block", margin: "0 auto" } })),
                    React.createElement(components_1.Text, { style: { marginTop: 12, marginBottom: 0, fontSize: 18, fontWeight: 700, color: "#2B2F77" } }, "GoldKach Limited")),
                children,
                React.createElement(components_1.Hr, { style: { marginTop: 24, marginBottom: 16, borderTop: "1px solid #e0e0e0" } }),
                React.createElement(components_1.Section, { style: { textAlign: "center", fontSize: 12, color: "#777" } },
                    React.createElement(components_1.Text, { style: { margin: "4px 0" } },
                        React.createElement(components_1.Link, { href: "https://goldkach.co.ug", style: { color: "#2B2F77", textDecoration: "none" } }, "Website"),
                        " • ",
                        React.createElement(components_1.Link, { href: "mailto:info@goldkach.co.ug", style: { color: "#2B2F77", textDecoration: "none" } }, "Contact Us")),
                    React.createElement(components_1.Text, { style: { margin: "4px 0" } }, "Tel: +256 200 903314 / +256 393 246074"),
                    React.createElement(components_1.Text, { style: { margin: "4px 0" } }, "3rd Floor, Kanjokya House, Plot 90, Kanjokya Street, Kampala, Uganda"),
                    React.createElement(components_1.Text, { style: { marginTop: 12, color: "#aaa" } },
                        "\u00A9 ",
                        new Date().getFullYear(),
                        " GoldKach Limited. All rights reserved."))))));
}
