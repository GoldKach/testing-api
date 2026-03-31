// src/controllers/portfolio-pdf-report.ts
import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "@/db/db";
import type { AssetClass } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                  */
/* ------------------------------------------------------------------ */

const NAVY       = "#1B3A6B";
const BLUE       = "#2E6DA4";
const ROW_ALT    = "#F0F4FA";
const ROW_WHITE  = "#FFFFFF";
const HEADER_ROW = "#1B3A6B";
const BORDER     = "#D0D8E8";
const DARK_TEXT  = "#1A1A1A";
const MED_TEXT   = "#444444";

const PAGE_W  = 595;
const PAGE_H  = 842;
const MARGIN  = 40;
const CONTENT = PAGE_W - MARGIN * 2; // 515

function fmt$(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtPct(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtNum(n: number | null | undefined, dp = 2): string {
  return Number(n ?? 0).toFixed(dp);
}

function getQuarter(date: Date): string {
  const m = date.getMonth();
  const y = date.getFullYear();
  if (m <= 2) return `Q1 ${y}`;
  if (m <= 5) return `Q2 ${y}`;
  if (m <= 8) return `Q3 ${y}`;
  return `Q4 ${y}`;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function determineAssetClass(asset: any): AssetClass {
  if (asset.assetClass) return asset.assetClass as AssetClass;
  const sym  = (asset.symbol      ?? "").toLowerCase();
  const desc = (asset.description ?? "").toLowerCase();
  const sec  = (asset.sector      ?? "").toLowerCase();
  if (desc.includes("etf") || desc.includes("exchange traded fund") ||
      ["qqq","spy","voo","iwm","soxx","xlk","vti"].includes(sym)) return "ETFS";
  if (sec.includes("real estate") || sec.includes("reit") || desc.includes("reit")) return "REITS";
  if (sec.includes("bond") || desc.includes("bond") || desc.includes("treasury")) return "BONDS";
  if (sym === "cash" || sym === "usd") return "CASH";
  return "EQUITIES";
}

/* ------------------------------------------------------------------ */
/*  PDF drawing primitives                                              */
/* ------------------------------------------------------------------ */

/** Filled rectangle + optional top-left label in white bold */
function sectionHeader(doc: PDFKit.PDFDocument, y: number, text: string, h = 26): number {
  doc.rect(MARGIN, y, CONTENT, h).fill(NAVY);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .text(text, MARGIN + 10, y + 8, { width: CONTENT - 20, lineBreak: false });
  return y + h;
}

interface ColDef {
  label: string;
  width: number;
  align?: "left" | "right" | "center";
}

/** Draw a table header row (dark blue bg, white text) */
function tableHeader(doc: PDFKit.PDFDocument, cols: ColDef[], y: number, rowH = 22): number {
  let x = MARGIN;
  // Draw all backgrounds first, then all text — avoids pdfkit internal cursor drift
  cols.forEach((col) => {
    doc.rect(x, y, col.width, rowH).fill(NAVY);
    x += col.width;
  });
  x = MARGIN;
  cols.forEach((col) => {
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(col.label, x + 4, y + 7, {
        width: col.width - 8,
        align: col.align ?? "left",
        lineBreak: false,
      });
    x += col.width;
  });
  return y + rowH;
}

/** Draw a single table data row */
function tableRow(
  doc: PDFKit.PDFDocument,
  cols: ColDef[],
  values: string[],
  y: number,
  rowH = 18,
  alt = false,
  bold = false,
): number {
  let x = MARGIN;
  const bg = alt ? ROW_ALT : ROW_WHITE;
  // Pass 1 — all backgrounds & borders
  cols.forEach((col) => {
    doc.rect(x, y, col.width, rowH).fill(bg);
    doc.rect(x, y, col.width, rowH).lineWidth(0.4).stroke(BORDER);
    x += col.width;
  });
  // Pass 2 — all text (after all rects are done, cursor state is stable)
  x = MARGIN;
  cols.forEach((col, i) => {
    doc
      .fillColor(bold ? NAVY : DARK_TEXT)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8.5)
      .text(values[i] ?? "", x + 4, y + 5, {
        width: col.width - 8,
        align: col.align ?? "left",
        lineBreak: false,
      });
    x += col.width;
  });
  return y + rowH;
}

/** Two-column key/value info table */
function infoTable(
  doc: PDFKit.PDFDocument,
  rows: [string, string][],
  y: number,
  labelW = 160,
): number {
  const valueW = CONTENT - labelW;
  rows.forEach(([label, value], i) => {
    const bg = i % 2 === 0 ? ROW_WHITE : ROW_ALT;
    // backgrounds first
    doc.rect(MARGIN, y, labelW, 20).fill(bg);
    doc.rect(MARGIN, y, labelW, 20).lineWidth(0.4).stroke(BORDER);
    doc.rect(MARGIN + labelW, y, valueW, 20).fill(bg);
    doc.rect(MARGIN + labelW, y, valueW, 20).lineWidth(0.4).stroke(BORDER);
    // text after
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

/** Draw page logo area (top of every page) */
function drawPageHeader(doc: PDFKit.PDFDocument, title = "GoldKach Performance Report") {
  // Decorative diamond logo placeholder
  const lx = MARGIN, ly = MARGIN;
  // Outer diamond border
  doc.save();
  doc.translate(lx + 28, ly + 22);
  doc
    .moveTo(0, -20).lineTo(20, 0).lineTo(0, 20).lineTo(-20, 0).closePath()
    .lineWidth(2)
    .stroke(NAVY);
  // Inner small diamond
  doc
    .moveTo(0, -10).lineTo(10, 0).lineTo(0, 10).lineTo(-10, 0).closePath()
    .fill(BLUE);
  doc.restore();

  // "GoldKach" text
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(18).text("GoldKach", lx + 55, ly + 14);
  doc.fillColor(BLUE).font("Helvetica").fontSize(8.5).text("Investment Management", lx + 55, ly + 33);

  // Title bar on the right
  const barW = 310, barX = PAGE_W - MARGIN - barW;
  doc.rect(barX, ly, barW, 50).fill(NAVY);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(title, barX + 12, ly + 16, { width: barW - 24, align: "right" });

  // Thin separator line
  doc.moveTo(MARGIN, ly + 58).lineTo(PAGE_W - MARGIN, ly + 58).lineWidth(1.5).stroke(NAVY);
}

/* ------------------------------------------------------------------ */
/*  Foot note on each page                                              */
/* ------------------------------------------------------------------ */
function drawPageFooter(doc: PDFKit.PDFDocument, pageNum: number) {
  const y = PAGE_H - 28;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(0.5).stroke(BORDER);
  doc
    .fillColor("#888888")
    .font("Helvetica")
    .fontSize(7.5)
    .text(
      "GoldKach Uganda Limited — Regulated by the Capital Markets Authority of Uganda. Licence No. GKUL 2526 (FM)",
      MARGIN,
      y + 4,
      { width: CONTENT - 60, align: "left" }
    );
  doc
    .text(`Page ${pageNum}`, PAGE_W - MARGIN - 50, y + 4, { width: 50, align: "right" });
}

/* ------------------------------------------------------------------ */
/*  Main export                                                         */
/* ------------------------------------------------------------------ */

export async function generatePortfolioPdfReport(req: Request, res: Response) {
  try {
    const { userPortfolioId } = req.params;

    /* ── 1. Fetch all required data ─────────────────────────────── */
    const userPortfolio = await db.userPortfolio.findUnique({
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
    const reportDate      = new Date();
    const reportingPeriod = getQuarter(reportDate);

    /* ── 2. Compute totals ──────────────────────────────────────── */
    let totalCostPrice  = 0;
    let totalCloseValue = 0;
    let totalLossGain   = 0;

    const ALL_CLASSES: AssetClass[] = ["EQUITIES", "ETFS", "REITS", "BONDS", "CASH", "OTHERS"];
    const classMap = new Map<AssetClass, { holdings: number; totalCashValue: number }>();
    ALL_CLASSES.forEach((c) => classMap.set(c, { holdings: 0, totalCashValue: 0 }));

    for (const ua of userAssets) {
      const cost  = Number(ua.costPrice  ?? 0);
      const close = Number(ua.closeValue ?? 0);
      const gain  = Number(ua.lossGain   ?? 0);
      totalCostPrice  += cost;
      totalCloseValue += close;
      totalLossGain   += gain;
      const cls   = determineAssetClass(ua.asset);
      const entry = classMap.get(cls)!;
      entry.holdings       += 1;
      entry.totalCashValue += close;
    }

    const returnPct = totalCostPrice > 0 ? (totalLossGain / totalCostPrice) * 100 : 0;

    const bankFee       = Number(wallet?.bankFee       ?? 30);
    const transactionFee = Number(wallet?.transactionFee ?? 10);
    const feeAtBank     = Number(wallet?.feeAtBank     ?? 10);
    const totalFees     = Number(wallet?.totalFees     ?? 50);
    const grandTotal    = totalCloseValue + feeAtBank; // close value + uninvested cash

    /* ── 3. Build PDF ───────────────────────────────────────────── */
    const doc = new PDFDocument({
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
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="goldkach-report-${userPortfolioId}-${reportDate.toISOString().slice(0, 10)}.pdf"`
    );
    doc.pipe(res);

    /* ============================================================= */
    /*  PAGE 1 — Summary                                              */
    /* ============================================================= */
    drawPageHeader(doc);
    let y = MARGIN + 72;

    // ── Client Information ────────────────────────────────────────
    y = sectionHeader(doc, y, "Client Information") + 6;
    y = infoTable(doc, [
      ["Client Name",       `${user.firstName} ${user.lastName}`],
      ["Fund Name",         userPortfolio.customName || portfolio.name],
      ["Account Number",    user.masterWallet?.accountNumber ?? "—"],
      ["Reporting Period",  reportingPeriod],
      ["Report Date",       fmtDate(reportDate)],
    ], y);
    y += 18;

    // ── Performance Snapshot ──────────────────────────────────────
    y = sectionHeader(doc, y, "Performance Snapshot") + 6;
    const perfCols: ColDef[] = [
      { label: "Period",           width: 200, align: "left"  },
      { label: "Portfolio Return", width: CONTENT - 200, align: "right" },
    ];
    y = tableHeader(doc, perfCols, y);
    y = tableRow(doc, perfCols, [reportingPeriod, fmtPct(returnPct)], y, 22, false);
    y += 18;

    // ── Asset Allocation ──────────────────────────────────────────
    y = sectionHeader(doc, y, "Asset Allocation") + 6;
    const allocCols: ColDef[] = [
      { label: "Asset Class",       width: 160, align: "left"   },
      { label: "Holdings",          width: 80,  align: "center" },
      { label: "Total Cash Value",  width: 175, align: "right"  },
      { label: "%",                 width: 100, align: "right"  },
    ];
    y = tableHeader(doc, allocCols, y);
    let alt = false;
    for (const cls of ALL_CLASSES) {
      const entry = classMap.get(cls)!;
      y = tableRow(
        doc, allocCols,
        [
          cls,
          String(entry.holdings),
          fmt$(entry.totalCashValue),
          totalCloseValue > 0 ? `${((entry.totalCashValue / totalCloseValue) * 100).toFixed(2)}%` : "0.00%",
        ],
        y, 18, alt,
      );
      alt = !alt;
    }
    // Total row
    y = tableRow(
      doc, allocCols,
      ["Total", String(userAssets.length), fmt$(totalCloseValue), "100.00%"],
      y, 20, false, true,
    );

    drawPageFooter(doc, 1);

    /* ============================================================= */
    /*  PAGE 2 — Holdings + Commentary                               */
    /* ============================================================= */
    doc.addPage();
    drawPageHeader(doc);
    y = MARGIN + 72;

    // ── Portfolio Holdings ────────────────────────────────────────
    y = sectionHeader(doc, y, "Portfolio Holdings") + 6;

    // widths must sum to CONTENT (515)
    // 42+100+48+50+63+60+60+60+32 = 515
    const holdCols: ColDef[] = [
      { label: "Symbol",         width: 42,  align: "left"   },
      { label: "Description",    width: 100, align: "left"   },
      { label: "Stocks",         width: 48,  align: "right"  },
      { label: "Allocation",     width: 50,  align: "right"  },
      { label: "Cost Per Share", width: 63,  align: "right"  },
      { label: "Cost Price",     width: 60,  align: "right"  },
      { label: "Close Price",    width: 60,  align: "right"  },
      { label: "Close Value",    width: 60,  align: "right"  },
      { label: "UrL/G",          width: 32,  align: "right"  },
    ];
    y = tableHeader(doc, holdCols, y, 22);

    alt = false;
    for (const ua of userAssets) {
      const gain = Number(ua.lossGain ?? 0);
      y = tableRow(
        doc, holdCols,
        [
          ua.asset.symbol,
          ua.asset.description,
          fmtNum(ua.stock, 2),
          `${Number(ua.allocationPercentage ?? 0).toFixed(0)}%`,
          fmt$(ua.costPerShare),
          fmt$(ua.costPrice),
          fmt$(ua.asset.closePrice),
          fmt$(ua.closeValue),
          fmt$(gain),
        ],
        y, 20, alt,
      );
      alt = !alt;
    }
    // Sub Total row
    y = tableRow(
      doc, holdCols,
      ["Sub Total", "", "", "", "", fmt$(totalCostPrice), "", fmt$(totalCloseValue), fmt$(totalLossGain)],
      y, 22, false, true,
    );
    y += 10;

    // ── Fees mini-table ───────────────────────────────────────────
    const feeColW = 340;
    const feeValW = CONTENT - feeColW;
    const feePairs: [string, string][] = [
      ["Bank Costs",        fmt$(bankFee)],
      ["Transaction Cost",  fmt$(transactionFee)],
      ["Cash at Bank",      fmt$(feeAtBank)],
      ["Sub Total",         fmt$(totalFees)],
    ];
    // backgrounds first, then text
    feePairs.forEach(([label, value], i) => {
      const bg    = i % 2 === 0 ? ROW_WHITE : ROW_ALT;
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
    // Grand Total row — backgrounds then text
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

    // ── Market Commentary ─────────────────────────────────────────
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
      .text(
        "Technology equities continued to deliver strong performance during the period, led by the semiconductor and " +
        "large-cap technology sectors. Sustained demand for artificial intelligence infrastructure, cloud computing, " +
        "and data-centre buildout supported equity valuations across the portfolio's core holdings. " +
        "The portfolio's diversified exposure across growth sectors helped capture upside from structural technology trends " +
        "while managing risk through balanced allocation across multiple asset classes.",
        MARGIN, y,
        { width: CONTENT, lineGap: 3 }
      );

    drawPageFooter(doc, 2);

    /* ============================================================= */
    /*  PAGE 3 — Definitions, Regulation, Address                    */
    /* ============================================================= */
    doc.addPage();
    drawPageHeader(doc);
    y = MARGIN + 72;

    y = sectionHeader(doc, y, "Definitions") + 14;

    const defs: [string, string][] = [
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
      .text(
        "GoldKach Uganda Limited is regulated by the Capital Markets Authority of Uganda as a Fund Manager. " +
        "Licence No. GKUL 2526 (FM)",
        MARGIN, y, { width: CONTENT }
      );
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

    /* ============================================================= */
    /*  PAGE 4 — Disclaimer                                          */
    /* ============================================================= */
    doc.addPage();
    drawPageHeader(doc);
    y = MARGIN + 72;

    y = sectionHeader(doc, y, "Disclaimer") + 14;
    doc
      .fillColor(DARK_TEXT)
      .font("Helvetica")
      .fontSize(9)
      .text(
        "Past performance is not a reliable indicator of future results. Portfolio returns are provided for information " +
        "purposes only and reflect historical performance over the stated period. Performance may be influenced by market " +
        "conditions, currency movements, fees, and other external factors. The value of investments may fluctuate over time. " +
        "This information does not constitute investment advice or a solicitation to buy or sell any financial instrument. " +
        "Investors should consider their individual circumstances and seek independent professional advice where appropriate.",
        MARGIN, y,
        { width: CONTENT, lineGap: 3 }
      );

    drawPageFooter(doc, 4);

    doc.end();
  } catch (error) {
    console.error("generatePortfolioPdfReport error:", error);
    if (!res.headersSent) {
      res.status(500).json({ data: null, error: "Failed to generate PDF report" });
    }
  }
}
