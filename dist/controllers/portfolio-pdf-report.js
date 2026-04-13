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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePortfolioPdfReport = generatePortfolioPdfReport;
const pdfkit_1 = __importDefault(require("pdfkit"));
const db_1 = require("../db/db");
const NAVY = "#1B3A6B";
const BLUE = "#2E6DA4";
const ROW_ALT = "#F0F4FA";
const ROW_WHITE = "#FFFFFF";
const HEADER_ROW = "#1B3A6B";
const BORDER = "#D0D8E8";
const DARK_TEXT = "#1A1A1A";
const MED_TEXT = "#444444";
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const CONTENT = PAGE_W - MARGIN * 2;
function fmt$(n) {
    const v = Number(n !== null && n !== void 0 ? n : 0);
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(v);
}
function fmtPct(n) {
    const v = Number(n !== null && n !== void 0 ? n : 0);
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
}
function fmtNum(n, dp = 2) {
    return Number(n !== null && n !== void 0 ? n : 0).toFixed(dp);
}
function getQuarter(date) {
    const m = date.getMonth();
    const y = date.getFullYear();
    if (m <= 2)
        return `Q1 ${y}`;
    if (m <= 5)
        return `Q2 ${y}`;
    if (m <= 8)
        return `Q3 ${y}`;
    return `Q4 ${y}`;
}
function fmtDate(date) {
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
function determineAssetClass(asset) {
    var _a, _b, _c;
    if (asset.assetClass)
        return asset.assetClass;
    const sym = ((_a = asset.symbol) !== null && _a !== void 0 ? _a : "").toLowerCase();
    const desc = ((_b = asset.description) !== null && _b !== void 0 ? _b : "").toLowerCase();
    const sec = ((_c = asset.sector) !== null && _c !== void 0 ? _c : "").toLowerCase();
    if (desc.includes("etf") || desc.includes("exchange traded fund") ||
        ["qqq", "spy", "voo", "iwm", "soxx", "xlk", "vti"].includes(sym))
        return "ETFS";
    if (sec.includes("real estate") || sec.includes("reit") || desc.includes("reit"))
        return "REITS";
    if (sec.includes("bond") || desc.includes("bond") || desc.includes("treasury"))
        return "BONDS";
    if (sym === "cash" || sym === "usd")
        return "CASH";
    return "EQUITIES";
}
function sectionHeader(doc, y, text, h = 26) {
    doc.rect(MARGIN, y, CONTENT, h).fill(NAVY);
    doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .text(text, MARGIN + 10, y + 8, { width: CONTENT - 20, lineBreak: false });
    return y + h;
}
function tableHeader(doc, cols, y, rowH = 22) {
    let x = MARGIN;
    cols.forEach((col) => {
        doc.rect(x, y, col.width, rowH).fill(NAVY);
        x += col.width;
    });
    x = MARGIN;
    cols.forEach((col) => {
        var _a;
        doc
            .fillColor("#FFFFFF")
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .text(col.label, x + 4, y + 7, {
            width: col.width - 8,
            align: (_a = col.align) !== null && _a !== void 0 ? _a : "left",
            lineBreak: false,
        });
        x += col.width;
    });
    return y + rowH;
}
function tableRow(doc, cols, values, y, rowH = 18, alt = false, bold = false) {
    let x = MARGIN;
    const bg = alt ? ROW_ALT : ROW_WHITE;
    cols.forEach((col) => {
        doc.rect(x, y, col.width, rowH).fill(bg);
        doc.rect(x, y, col.width, rowH).lineWidth(0.4).stroke(BORDER);
        x += col.width;
    });
    x = MARGIN;
    cols.forEach((col, i) => {
        var _a, _b;
        doc
            .fillColor(bold ? NAVY : DARK_TEXT)
            .font(bold ? "Helvetica-Bold" : "Helvetica")
            .fontSize(8.5)
            .text((_a = values[i]) !== null && _a !== void 0 ? _a : "", x + 4, y + 5, {
            width: col.width - 8,
            align: (_b = col.align) !== null && _b !== void 0 ? _b : "left",
            lineBreak: false,
        });
        x += col.width;
    });
    return y + rowH;
}
function infoTable(doc, rows, y, labelW = 160) {
    const valueW = CONTENT - labelW;
    rows.forEach(([label, value], i) => {
        const bg = i % 2 === 0 ? ROW_WHITE : ROW_ALT;
        doc.rect(MARGIN, y, labelW, 20).fill(bg);
        doc.rect(MARGIN, y, labelW, 20).lineWidth(0.4).stroke(BORDER);
        doc.rect(MARGIN + labelW, y, valueW, 20).fill(bg);
        doc.rect(MARGIN + labelW, y, valueW, 20).lineWidth(0.4).stroke(BORDER);
        doc
            .fillColor(MED_TEXT)
            .font("Helvetica-Bold")
            .fontSize(9)
            .text(label, MARGIN + 6, y + 6, { width: labelW - 8, lineBreak: false });
        doc
            .fillColor(DARK_TEXT)
            .font("Helvetica")
            .fontSize(9)
            .text(value, MARGIN + labelW + 6, y + 6, { width: valueW - 8, lineBreak: false });
        y += 20;
    });
    return y;
}
function drawPageHeader(doc, title = "GoldKach Performance Report") {
    const lx = MARGIN, ly = MARGIN;
    doc.save();
    doc.translate(lx + 28, ly + 22);
    doc
        .moveTo(0, -20).lineTo(20, 0).lineTo(0, 20).lineTo(-20, 0).closePath()
        .lineWidth(2)
        .stroke(NAVY);
    doc
        .moveTo(0, -10).lineTo(10, 0).lineTo(0, 10).lineTo(-10, 0).closePath()
        .fill(BLUE);
    doc.restore();
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(18).text("GoldKach", lx + 55, ly + 14);
    doc.fillColor(BLUE).font("Helvetica").fontSize(8.5).text("Investment Management", lx + 55, ly + 33);
    const barW = 310, barX = PAGE_W - MARGIN - barW;
    doc.rect(barX, ly, barW, 50).fill(NAVY);
    doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(title, barX + 12, ly + 16, { width: barW - 24, align: "right" });
    doc.moveTo(MARGIN, ly + 58).lineTo(PAGE_W - MARGIN, ly + 58).lineWidth(1.5).stroke(NAVY);
}
function drawPageFooter(doc, pageNum) {
    const y = PAGE_H - 28;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(0.5).stroke(BORDER);
    doc
        .fillColor("#888888")
        .font("Helvetica")
        .fontSize(7.5)
        .text("GoldKach Uganda Limited — Regulated by the Capital Markets Authority of Uganda. Licence No. GKUL 2526 (FM)", MARGIN, y + 4, { width: CONTENT - 60, align: "left" });
    doc
        .text(`Page ${pageNum}`, PAGE_W - MARGIN - 50, y + 4, { width: 50, align: "right" });
}
function generatePortfolioPdfReport(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        try {
            const { userPortfolioId } = req.params;
            const userPortfolio = yield db_1.db.userPortfolio.findUnique({
                where: { id: userPortfolioId },
                include: {
                    portfolio: { select: { id: true, name: true } },
                    user: {
                        select: {
                            id: true, firstName: true, lastName: true, email: true,
                            masterWallet: { select: { accountNumber: true } },
                        },
                    },
                    wallet: true,
                    userAssets: {
                        include: {
                            asset: {
                                select: {
                                    id: true, symbol: true, description: true,
                                    assetClass: true, closePrice: true, sector: true,
                                },
                            },
                        },
                    },
                },
            });
            if (!userPortfolio) {
                return res.status(404).json({ data: null, error: "Portfolio not found" });
            }
            const { user, portfolio, wallet, userAssets } = userPortfolio;
            const reportDate = new Date();
            const reportingPeriod = getQuarter(reportDate);
            let totalCostPrice = 0;
            let totalCloseValue = 0;
            let totalLossGain = 0;
            const ALL_CLASSES = ["EQUITIES", "ETFS", "REITS", "BONDS", "CASH", "OTHERS"];
            const classMap = new Map();
            ALL_CLASSES.forEach((c) => classMap.set(c, { holdings: 0, totalCashValue: 0 }));
            for (const ua of userAssets) {
                const cost = Number((_a = ua.costPrice) !== null && _a !== void 0 ? _a : 0);
                const close = Number((_b = ua.closeValue) !== null && _b !== void 0 ? _b : 0);
                const gain = Number((_c = ua.lossGain) !== null && _c !== void 0 ? _c : 0);
                totalCostPrice += cost;
                totalCloseValue += close;
                totalLossGain += gain;
                const cls = determineAssetClass(ua.asset);
                const entry = classMap.get(cls);
                entry.holdings += 1;
                entry.totalCashValue += close;
            }
            const returnPct = totalCostPrice > 0 ? (totalLossGain / totalCostPrice) * 100 : 0;
            const bankFee = Number((_d = wallet === null || wallet === void 0 ? void 0 : wallet.bankFee) !== null && _d !== void 0 ? _d : 30);
            const transactionFee = Number((_e = wallet === null || wallet === void 0 ? void 0 : wallet.transactionFee) !== null && _e !== void 0 ? _e : 10);
            const feeAtBank = Number((_f = wallet === null || wallet === void 0 ? void 0 : wallet.feeAtBank) !== null && _f !== void 0 ? _f : 10);
            const totalFees = Number((_g = wallet === null || wallet === void 0 ? void 0 : wallet.totalFees) !== null && _g !== void 0 ? _g : 50);
            const grandTotal = totalCloseValue + feeAtBank;
            const doc = new pdfkit_1.default({
                size: "A4",
                margin: MARGIN,
                autoFirstPage: true,
                bufferPages: true,
                info: {
                    Title: `GoldKach Performance Report — ${user.firstName} ${user.lastName}`,
                    Author: "GoldKach Investment Management",
                },
            });
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="goldkach-report-${userPortfolioId}-${reportDate.toISOString().slice(0, 10)}.pdf"`);
            doc.pipe(res);
            drawPageHeader(doc);
            let y = MARGIN + 72;
            y = sectionHeader(doc, y, "Client Information") + 6;
            y = infoTable(doc, [
                ["Client Name", `${user.firstName} ${user.lastName}`],
                ["Fund Name", userPortfolio.customName || portfolio.name],
                ["Account Number", (_j = (_h = user.masterWallet) === null || _h === void 0 ? void 0 : _h.accountNumber) !== null && _j !== void 0 ? _j : "—"],
                ["Reporting Period", reportingPeriod],
                ["Report Date", fmtDate(reportDate)],
            ], y);
            y += 18;
            y = sectionHeader(doc, y, "Performance Snapshot") + 6;
            const perfCols = [
                { label: "Period", width: 200, align: "left" },
                { label: "Portfolio Return", width: CONTENT - 200, align: "right" },
            ];
            y = tableHeader(doc, perfCols, y);
            y = tableRow(doc, perfCols, [reportingPeriod, fmtPct(returnPct)], y, 22, false);
            y += 18;
            y = sectionHeader(doc, y, "Asset Allocation") + 6;
            const allocCols = [
                { label: "Asset Class", width: 160, align: "left" },
                { label: "Holdings", width: 80, align: "center" },
                { label: "Total Cash Value", width: 175, align: "right" },
                { label: "%", width: 100, align: "right" },
            ];
            y = tableHeader(doc, allocCols, y);
            let alt = false;
            for (const cls of ALL_CLASSES) {
                const entry = classMap.get(cls);
                y = tableRow(doc, allocCols, [
                    cls,
                    String(entry.holdings),
                    fmt$(entry.totalCashValue),
                    totalCloseValue > 0 ? `${((entry.totalCashValue / totalCloseValue) * 100).toFixed(2)}%` : "0.00%",
                ], y, 18, alt);
                alt = !alt;
            }
            y = tableRow(doc, allocCols, ["Total", String(userAssets.length), fmt$(totalCloseValue), "100.00%"], y, 20, false, true);
            drawPageFooter(doc, 1);
            doc.addPage();
            drawPageHeader(doc);
            y = MARGIN + 72;
            y = sectionHeader(doc, y, "Portfolio Holdings") + 6;
            const holdCols = [
                { label: "Symbol", width: 42, align: "left" },
                { label: "Description", width: 100, align: "left" },
                { label: "Stocks", width: 48, align: "right" },
                { label: "Allocation", width: 50, align: "right" },
                { label: "Cost Per Share", width: 63, align: "right" },
                { label: "Cost Price", width: 60, align: "right" },
                { label: "Close Price", width: 60, align: "right" },
                { label: "Close Value", width: 60, align: "right" },
                { label: "UrL/G", width: 32, align: "right" },
            ];
            y = tableHeader(doc, holdCols, y, 22);
            alt = false;
            for (const ua of userAssets) {
                const gain = Number((_k = ua.lossGain) !== null && _k !== void 0 ? _k : 0);
                y = tableRow(doc, holdCols, [
                    ua.asset.symbol,
                    ua.asset.description,
                    fmtNum(ua.stock, 2),
                    `${Number((_l = ua.allocationPercentage) !== null && _l !== void 0 ? _l : 0).toFixed(0)}%`,
                    fmt$(ua.costPerShare),
                    fmt$(ua.costPrice),
                    fmt$(ua.asset.closePrice),
                    fmt$(ua.closeValue),
                    fmt$(gain),
                ], y, 20, alt);
                alt = !alt;
            }
            y = tableRow(doc, holdCols, ["Sub Total", "", "", "", "", fmt$(totalCostPrice), "", fmt$(totalCloseValue), fmt$(totalLossGain)], y, 22, false, true);
            y += 10;
            const feeColW = 340;
            const feeValW = CONTENT - feeColW;
            const feePairs = [
                ["Bank Costs", fmt$(bankFee)],
                ["Transaction Cost", fmt$(transactionFee)],
                ["Cash at Bank", fmt$(feeAtBank)],
                ["Sub Total", fmt$(totalFees)],
            ];
            feePairs.forEach(([label, value], i) => {
                const bg = i % 2 === 0 ? ROW_WHITE : ROW_ALT;
                const isSub = label === "Sub Total";
                doc.rect(MARGIN, y, feeColW, 18).fill(bg);
                doc.rect(MARGIN, y, feeColW, 18).lineWidth(0.4).stroke(BORDER);
                doc.rect(MARGIN + feeColW, y, feeValW, 18).fill(bg);
                doc.rect(MARGIN + feeColW, y, feeValW, 18).lineWidth(0.4).stroke(BORDER);
                doc
                    .fillColor(DARK_TEXT)
                    .font(isSub ? "Helvetica-Bold" : "Helvetica")
                    .fontSize(9)
                    .text(label, MARGIN + 6, y + 5, { width: feeColW - 12, lineBreak: false });
                doc
                    .fillColor(DARK_TEXT)
                    .font(isSub ? "Helvetica-Bold" : "Helvetica")
                    .fontSize(9)
                    .text(value, MARGIN + feeColW + 4, y + 5, { width: feeValW - 8, align: "right", lineBreak: false });
                y += 18;
            });
            doc.rect(MARGIN, y, feeColW, 20).fill(NAVY);
            doc.rect(MARGIN + feeColW, y, feeValW, 20).fill(NAVY);
            doc
                .fillColor("#FFFFFF")
                .font("Helvetica-Bold")
                .fontSize(9.5)
                .text("Total", MARGIN + 6, y + 6, { width: feeColW - 12, lineBreak: false });
            doc
                .fillColor("#FFFFFF")
                .font("Helvetica-Bold")
                .fontSize(9.5)
                .text(fmt$(grandTotal), MARGIN + feeColW + 4, y + 6, { width: feeValW - 8, align: "right", lineBreak: false });
            y += 20 + 20;
            y = sectionHeader(doc, y, "Market Commentary") + 10;
            doc
                .fillColor(DARK_TEXT)
                .font("Helvetica-Bold")
                .fontSize(9.5)
                .text(`Market Commentary — ${reportDate.getFullYear()}`, MARGIN, y);
            y += 18;
            doc
                .fillColor(DARK_TEXT)
                .font("Helvetica")
                .fontSize(9)
                .text("Technology equities continued to deliver strong performance during the period, led by the semiconductor and " +
                "large-cap technology sectors. Sustained demand for artificial intelligence infrastructure, cloud computing, " +
                "and data-centre buildout supported equity valuations across the portfolio's core holdings. " +
                "The portfolio's diversified exposure across growth sectors helped capture upside from structural technology trends " +
                "while managing risk through balanced allocation across multiple asset classes.", MARGIN, y, { width: CONTENT, lineGap: 3 });
            drawPageFooter(doc, 2);
            doc.addPage();
            drawPageHeader(doc);
            y = MARGIN + 72;
            y = sectionHeader(doc, y, "Definitions") + 14;
            const defs = [
                ["Symbol (Ticker):",
                    "A unique abbreviation used to identify a publicly traded security on a stock exchange. For example, AAPL is the ticker symbol for Apple Inc."],
                ["Cost Per Share:",
                    "The average price paid to acquire one share of a security, including any commissions or transaction fees."],
                ["Cost Price:",
                    "The total amount paid for a security or group of securities. Calculated as: Cost Price = Number of Shares × Cost Per Share."],
                ["Close Price:",
                    "The last price at which a security was traded during a regular trading session on a given day."],
                ["Close Value:",
                    "The market value of your holding based on the latest closing price. Calculated as: Close Value = Number of Shares × Close Price."],
                ["UrL/G:",
                    "The unrealised profit or loss on a holding, calculated as the difference between its current market value and its original cost. UrL/G = Close Value – Cost Price."],
                ["Reallocation:",
                    "The process of adjusting the distribution of assets within an investment portfolio to maintain desired allocation, respond to market changes, or align with updated investment goals."],
            ];
            for (const [term, defText] of defs) {
                doc
                    .fillColor(DARK_TEXT)
                    .font("Helvetica-Bold")
                    .fontSize(9)
                    .text(term, MARGIN, y);
                y += 14;
                doc
                    .fillColor(MED_TEXT)
                    .font("Helvetica")
                    .fontSize(9)
                    .text(defText, MARGIN, y, { width: CONTENT, lineGap: 2 });
                y += doc.heightOfString(defText, { width: CONTENT }) + 12;
            }
            y += 10;
            y = sectionHeader(doc, y, "Regulation") + 12;
            doc
                .fillColor(DARK_TEXT)
                .font("Helvetica")
                .fontSize(9)
                .text("GoldKach Uganda Limited is regulated by the Capital Markets Authority of Uganda as a Fund Manager. " +
                "Licence No. GKUL 2526 (FM)", MARGIN, y, { width: CONTENT });
            y += 40;
            y = sectionHeader(doc, y, "Address") + 12;
            doc
                .fillColor(DARK_TEXT)
                .font("Helvetica")
                .fontSize(9)
                .text("3rd Floor Kanjokya House\nPlot 90 Kanjokya Street\nP.O.Box 500094\nKampala, Uganda", MARGIN, y, {
                lineGap: 3,
            });
            drawPageFooter(doc, 3);
            doc.addPage();
            drawPageHeader(doc);
            y = MARGIN + 72;
            y = sectionHeader(doc, y, "Disclaimer") + 14;
            doc
                .fillColor(DARK_TEXT)
                .font("Helvetica")
                .fontSize(9)
                .text("Past performance is not a reliable indicator of future results. Portfolio returns are provided for information " +
                "purposes only and reflect historical performance over the stated period. Performance may be influenced by market " +
                "conditions, currency movements, fees, and other external factors. The value of investments may fluctuate over time. " +
                "This information does not constitute investment advice or a solicitation to buy or sell any financial instrument. " +
                "Investors should consider their individual circumstances and seek independent professional advice where appropriate.", MARGIN, y, { width: CONTENT, lineGap: 3 });
            drawPageFooter(doc, 4);
            doc.end();
        }
        catch (error) {
            console.error("generatePortfolioPdfReport error:", error);
            if (!res.headersSent) {
                res.status(500).json({ data: null, error: "Failed to generate PDF report" });
            }
        }
    });
}
