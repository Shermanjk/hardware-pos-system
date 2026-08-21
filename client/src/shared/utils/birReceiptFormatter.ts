/**
 * BIR-Compliant 80mm Thermal Receipt Formatter (42 Columns Monospace)
 * In accordance with RA 11976 (EOPT Act), RR 7-2024, and RMO 9-2021.
 *
 * Provides formatters for:
 * 1. Standard Sales Invoice (Checkout Receipt)
 * 2. X-Reading (Cashier Shift Report)
 * 3. Z-Reading (End of Day Audit Report)
 */

import type { StoreSettings } from "@/shared/api/settingsApi";

const RECEIPT_WIDTH = 42;

// ─── Monospace Alignment Utilities ─────────────────────────────────────────────

export function padLine(left: string, right: string, width = RECEIPT_WIDTH): string {
  const leftClean = String(left || "");
  const rightClean = String(right || "");
  const availableSpace = width - rightClean.length;
  if (leftClean.length > availableSpace) {
    // If left is too long, truncate or wrap
    const truncatedLeft = leftClean.slice(0, Math.max(0, availableSpace - 1)) + " ";
    return truncatedLeft + rightClean.padStart(width - truncatedLeft.length, " ");
  }
  return leftClean + rightClean.padStart(width - leftClean.length, " ");
}

export function centerLine(text: string, width = RECEIPT_WIDTH): string {
  const clean = String(text || "").trim();
  if (clean.length >= width) return clean.slice(0, width);
  const leftPad = Math.floor((width - clean.length) / 2);
  return " ".repeat(leftPad) + clean;
}

export function divider(char = "-", width = RECEIPT_WIDTH): string {
  return char.repeat(width);
}

export function doubleDivider(width = RECEIPT_WIDTH): string {
  return "=".repeat(width);
}

export function fmtPeso(val: number | string | null | undefined): string {
  const n = Number(val) || 0;
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pad4(num: number | string | null | undefined): string {
  return String(num || 0).padStart(4, "0");
}

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface SalesInvoiceItem {
  name: string;
  barcode?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxType: "VATABLE" | "VAT_EXEMPT" | "ZERO_RATED" | "NON_TAXABLE";
}

export interface SalesInvoiceParams {
  invoiceNumber: string;
  dateTime: string | Date;
  cashierName: string;
  terminalId?: string;
  customer: {
    name: string;
    tin?: string;
    address?: string;
    scPwdType?: "NONE" | "SENIOR_CITIZEN" | "PWD";
    scPwdId?: string;
  };
  items: SalesInvoiceItem[];
  subtotal: number;
  discount?: {
    name: string;
    percentage?: number;
    amount: number;
  };
  vatBreakdown: {
    vatableSales: number;
    vatAmount: number;
    vatExemptSales: number;
    zeroRatedSales: number;
    nonVatSales: number;
  };
  totalAmountDue: number;
  payment: {
    method: "CASH" | "CREDIT";
    tendered: number;
    change: number;
    downPayment?: number;
    chargedToAccount?: number;
    creditBalance?: number;
  };
  settings: StoreSettings;
  isTestMode?: boolean;
}

export interface XReadingParams {
  sessionId: number;
  shiftLabel: string;
  cashierName: string;
  openedAt: string | Date;
  closedAt?: string | Date | null;
  begInvoiceNo?: string | null;
  endInvoiceNo?: string | null;
  transactionCount: number;
  shiftGross: number;
  shiftDiscounts: number;
  shiftRefunds: number;
  shiftNet: number;
  openingCash: number;
  cashSales: number;
  creditCollections: number;
  cashRefunds: number;
  expectedCash: number;
  actualCash?: number | null;
  variance?: number | null;
  status?: string;
  settings: StoreSettings;
}

export interface ZReadingParams {
  id?: number;
  zCounterNo: number;
  resetCounterNo: number;
  readingDate: string | Date;
  openedAt: string | Date;
  closedAt: string | Date;
  generatedByName: string;
  begInvoiceNo?: string | null;
  endInvoiceNo?: string | null;
  begVoidNo?: string | null;
  endVoidNo?: string | null;
  begReturnNo?: string | null;
  endReturnNo?: string | null;
  oldGrandTotal: number;
  dailyGrossSales: number;
  newGrandTotal: number;
  vatableSales: number;
  vatAmount: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  nonVatSales: number;
  scDiscount: number;
  pwdDiscount: number;
  regularDiscount: number;
  totalDiscounts: number;
  totalReturns: number;
  totalVoids: number;
  netSales: number;
  cashSales: number;
  creditSales: number;
  transactionCount: number;
  voidCount: number;
  returnCount: number;
  settings: StoreSettings;
}

// ─── Header Helper ─────────────────────────────────────────────────────────

export function formatStoreTIN(settings: StoreSettings): string {
  const rawTin = String(settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = rawTin.length === 9
    ? `${rawTin.slice(0, 3)}-${rawTin.slice(3, 6)}-${rawTin.slice(6, 9)}`
    : (settings.tin || "000-000-000");
  const rawBranch = String(settings.branch_code || "00000").replace(/[^0-9]/g, "");
  const branchCode = rawBranch ? rawBranch.padStart(3, "0") : "00000";
  return `${tinFormatted}-${branchCode}`;
}

export function buildStoreHeaderLines(settings: StoreSettings, docTitle?: string): string[] {
  const lines: string[] = [];
  const storeName = settings.store_name || "HARDWARE POS STORE";
  const registeredName = settings.registered_taxpayer_name || "";
  const address = settings.address || "";
  const fullTin = formatStoreTIN(settings);
  const vatStatus = settings.vat_enabled ? "VAT REGISTERED" : "NON-VAT REGISTERED";
  const min = settings.pos_min || "N/A";
  const serial = settings.pos_serial || "N/A";
  const ptu = settings.ptu_or_accn_no || "";

  lines.push(doubleDivider());
  lines.push(centerLine(storeName));
  if (registeredName && registeredName !== storeName) {
    lines.push(centerLine(`Operated by: ${registeredName}`));
  }
  if (address) {
    lines.push(centerLine(address));
  }
  lines.push(centerLine(`${vatStatus} | TIN: ${fullTin}`));
  lines.push(centerLine(`MIN: ${min} | S/N: ${serial}`));
  if (ptu) {
    lines.push(centerLine(`PTU / ACCN: ${ptu}`));
  }
  if (settings.contact_number) {
    lines.push(centerLine(`Tel: ${settings.contact_number}`));
  }
  if (docTitle) {
    lines.push(doubleDivider());
    lines.push(centerLine(docTitle));
    lines.push(doubleDivider());
  }
  return lines;
}

// ─── 1. Format Sales Invoice ───────────────────────────────────────────────────

export function formatSalesInvoiceText(params: SalesInvoiceParams): string {
  const { settings, customer, items, discount, vatBreakdown, payment, isTestMode } = params;
  const lines: string[] = [];

  const dateObj = new Date(params.dateTime);
  const dateStr = dateObj.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  const timeStr = dateObj.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Header with PTU / ACCN and split TIN-branch
  lines.push(...buildStoreHeaderLines(settings, settings.document_type || "SALES INVOICE"));

  // Invoice & Customer Metadata
  lines.push(padLine("Invoice No:", params.invoiceNumber));
  lines.push(padLine("Date & Time:", `${dateStr} ${timeStr}`));
  lines.push(padLine("Cashier:", params.cashierName));
  if (params.terminalId) {
    lines.push(padLine("Terminal:", params.terminalId));
  }
  lines.push(divider());

  // Customer Section
  lines.push(padLine("Sold To:", customer.name || "Walk-in Customer"));
  if (customer.tin) {
    lines.push(padLine("TIN:", customer.tin));
  }
  if (customer.address) {
    lines.push(padLine("Address:", customer.address));
  }
  if (customer.scPwdType && customer.scPwdType !== "NONE") {
    const label = customer.scPwdType === "SENIOR_CITIZEN" ? "Senior Citizen ID:" : "PWD ID:";
    lines.push(padLine(label, customer.scPwdId || "N/A"));
  }
  lines.push(divider());

  // Item List
  lines.push(padLine("QTY  DESCRIPTION", "PRICE    AMOUNT"));
  lines.push(divider());

  let totalQty = 0;
  for (const item of items) {
    totalQty += item.quantity;
    const taxFlag = item.taxType === "VATABLE" ? "V" : item.taxType === "VAT_EXEMPT" ? "E" : item.taxType === "ZERO_RATED" ? "Z" : "N";
    lines.push(item.name);
    const qtyUnit = `${item.quantity} ${item.unit || "pc"}`.padEnd(12, " ");
    const priceStr = `@${fmtPeso(item.unitPrice)}`;
    const amtStr = `${fmtPeso(item.subtotal)} ${taxFlag}`;
    lines.push(padLine(`${qtyUnit} ${priceStr}`, amtStr));
  }
  lines.push(divider());

  // Totals & Discounts
  lines.push(padLine(`Item Count: ${totalQty}`, `P ${fmtPeso(params.subtotal)}`));
  if (discount && discount.amount > 0) {
    const discLabel = `Less: ${discount.name}${discount.percentage ? ` (${discount.percentage}%)` : ""}`;
    lines.push(padLine(discLabel, `-P ${fmtPeso(discount.amount)}`));
  }
  lines.push(doubleDivider());
  lines.push(padLine("TOTAL AMOUNT DUE", `P ${fmtPeso(params.totalAmountDue)}`));
  lines.push(doubleDivider());

  // Payment Breakdown
  lines.push("PAYMENT DETAILS:");
  lines.push(padLine("Payment Method:", payment.method));
  if (payment.method === "CASH") {
    lines.push(padLine("Cash Tendered:", `P ${fmtPeso(payment.tendered)}`));
    lines.push(padLine("Change Due:", `P ${fmtPeso(payment.change)}`));
  } else {
    if (payment.downPayment && payment.downPayment > 0) {
      lines.push(padLine("Down Payment (Cash):", `P ${fmtPeso(payment.downPayment)}`));
    }
    if (payment.chargedToAccount !== undefined) {
      lines.push(padLine("Charged to Account:", `P ${fmtPeso(payment.chargedToAccount)}`));
    }
    if (payment.creditBalance !== undefined) {
      lines.push(padLine("Total Account Balance:", `P ${fmtPeso(payment.creditBalance)}`));
    }
  }
  lines.push(divider());

  // BIR Tax Breakdown (Strict 4-Line Output)
  lines.push(centerLine("TAX BREAKDOWN"));
  lines.push(padLine("VATable Sales:", `P ${fmtPeso(vatBreakdown.vatableSales || 0)}`));
  lines.push(padLine("12% VAT Amount:", `P ${fmtPeso(vatBreakdown.vatAmount || 0)}`));
  lines.push(padLine("VAT-Exempt Sales:", `P ${fmtPeso(vatBreakdown.vatExemptSales || 0)}`));
  lines.push(padLine("Zero-Rated Sales:", `P ${fmtPeso(vatBreakdown.zeroRatedSales || 0)}`));
  if (vatBreakdown.nonVatSales && Number(vatBreakdown.nonVatSales) > 0) {
    lines.push(padLine("Non-VAT Sales:", `P ${fmtPeso(vatBreakdown.nonVatSales)}`));
  }
  lines.push(divider());

  // Signature line for SC/PWD or Credit sales
  if ((customer.scPwdType && customer.scPwdType !== "NONE") || payment.method === "CREDIT") {
    lines.push("");
    lines.push(centerLine("________________________________________"));
    lines.push(centerLine("Customer Signature / Acknowledgement"));
    lines.push("");
    lines.push(divider());
  }

  // Accreditation Footer & Disclaimer
  lines.push(centerLine("POS Software: Antigravity POS v2.0"));
  lines.push(centerLine("Accreditation No: 000-000000000-000000"));
  lines.push(doubleDivider());

  if (isTestMode || !settings.pos_min) {
    lines.push(centerLine("*** THIS DOCUMENT IS NOT VALID FOR ***"));
    lines.push(centerLine("***      CLAIM OF INPUT TAX        ***"));
    lines.push(centerLine("*** THIS IS NOT AN OFFICIAL INVOICE ***"));
  } else {
    lines.push(centerLine("THIS SERVES AS AN OFFICIAL SALES INVOICE"));
    lines.push(centerLine("Thank you for your business!"));
  }
  lines.push(doubleDivider());

  return lines.join("\n");
}

// ─── 2. Format X-Reading ───────────────────────────────────────────────────────

export function formatXReadingText(params: XReadingParams): string {
  const { settings } = params;
  const lines: string[] = [];

  const openDate = new Date(params.openedAt).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const closeDate = params.closedAt
    ? new Date(params.closedAt).toLocaleString("en-PH", {
        month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "STILL OPEN";

  // Full BIR Header with PTU/ACCN
  lines.push(...buildStoreHeaderLines(settings, "X - READING\n(CASHIER SHIFT REPORT)"));

  lines.push(padLine("Shift Session ID:", String(params.sessionId)));
  lines.push(padLine("Shift Label:", params.shiftLabel));
  lines.push(padLine("Cashier:", params.cashierName));
  lines.push(padLine("Shift Opened:", openDate));
  lines.push(padLine("Shift Closed:", closeDate));
  lines.push(padLine("Beginning Invoice:", params.begInvoiceNo || "None"));
  lines.push(padLine("Ending Invoice:", params.endInvoiceNo || "None"));
  lines.push(padLine("Transactions:", String(params.transactionCount)));
  lines.push(divider());

  lines.push(centerLine("SHIFT SALES SUMMARY"));
  lines.push(padLine("Gross Shift Sales:", `P ${fmtPeso(params.shiftGross)}`));
  lines.push(padLine("Less: Discounts:", `-P ${fmtPeso(params.shiftDiscounts)}`));
  lines.push(padLine("Less: Refunds:", `-P ${fmtPeso(params.shiftRefunds)}`));
  lines.push(divider());
  lines.push(padLine("NET SHIFT SALES:", `P ${fmtPeso(params.shiftNet)}`));
  lines.push(doubleDivider());

  lines.push(centerLine("CASH DRAWER RECONCILIATION"));
  lines.push(padLine("Opening Cash Float:", `P ${fmtPeso(params.openingCash)}`));
  lines.push(padLine("Cash Sales Inflow:", `P ${fmtPeso(params.cashSales)}`));
  if (params.creditCollections > 0) {
    lines.push(padLine("Credit (Utang) Paid:", `P ${fmtPeso(params.creditCollections)}`));
  }
  if (params.cashRefunds > 0) {
    lines.push(padLine("Cash Refunds Out:", `-P ${fmtPeso(params.cashRefunds)}`));
  }
  lines.push(divider());
  lines.push(padLine("EXPECTED CASH IN DRAWER:", `P ${fmtPeso(params.expectedCash)}`));

  if (params.actualCash !== undefined && params.actualCash !== null) {
    lines.push(padLine("ACTUAL COUNTED CASH:", `P ${fmtPeso(params.actualCash)}`));
    const varLabel = (params.variance || 0) < 0 ? "SHORTAGE:" : "OVERAGE:";
    lines.push(padLine(varLabel, `P ${fmtPeso(Math.abs(params.variance || 0))}`));
    lines.push(padLine("Status:", params.status || "Balanced"));
  }
  lines.push(doubleDivider());

  lines.push("");
  lines.push(centerLine("Cashier: _____________________________"));
  lines.push("");
  lines.push(centerLine("Supervisor: __________________________"));
  lines.push("");
  lines.push(doubleDivider());
  lines.push(centerLine("*** THIS IS NOT A Z-READING ***"));
  lines.push(centerLine("*** DOES NOT RESET GRAND TOTALS ***"));
  lines.push(doubleDivider());

  return lines.join("\n");
}

// ─── 3. Format Z-Reading ───────────────────────────────────────────────────────

export function formatZReadingText(params: ZReadingParams): string {
  const { settings } = params;
  const lines: string[] = [];

  const readDate = new Date(params.readingDate).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
  const openTime = new Date(params.openedAt).toLocaleString("en-PH", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const closeTime = new Date(params.closedAt).toLocaleString("en-PH", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  // Full BIR Header with PTU/ACCN
  lines.push(...buildStoreHeaderLines(settings, "Z - READING\n(END OF DAY AUDIT REPORT)"));

  lines.push(padLine("Z-Counter No.:", pad4(params.zCounterNo)));
  lines.push(padLine("Reset Counter No.:", String(params.resetCounterNo || 0)));
  lines.push(padLine("Reading Date:", readDate));
  lines.push(padLine("Generated By:", params.generatedByName));
  lines.push(padLine("Cutoff From:", openTime));
  lines.push(padLine("Cutoff To:", closeTime));
  lines.push(divider());

  lines.push(centerLine("AUDIT SEQUENCES"));
  lines.push(padLine("Beginning Invoice No:", params.begInvoiceNo || "None"));
  lines.push(padLine("Ending Invoice No:", params.endInvoiceNo || "None"));
  lines.push(padLine("Beginning Void No:", params.begVoidNo || "None"));
  lines.push(padLine("Ending Void No:", params.endVoidNo || "None"));
  lines.push(padLine("Beginning Return No:", params.begReturnNo || "None"));
  lines.push(padLine("Ending Return No:", params.endReturnNo || "None"));
  lines.push(divider());

  lines.push(centerLine("DAILY GROSS SALES"));
  lines.push(padLine("Gross Sales:", `P ${fmtPeso(params.dailyGrossSales)}`));
  lines.push(padLine("Less: Returns:", `-P ${fmtPeso(params.totalReturns)}`));
  lines.push(padLine("Less: Voids:", `-P ${fmtPeso(params.totalVoids)}`));
  lines.push(padLine("Less: SC 20% Discount:", `-P ${fmtPeso(params.scDiscount)}`));
  lines.push(padLine("Less: PWD 20% Discount:", `-P ${fmtPeso(params.pwdDiscount)}`));
  lines.push(padLine("Less: Other Discounts:", `-P ${fmtPeso(params.regularDiscount)}`));
  lines.push(divider());
  lines.push(padLine("NET SALES FOR THE DAY:", `P ${fmtPeso(params.netSales)}`));
  lines.push(doubleDivider());

  // BIR Tax Breakdown (Strict 4-Line Output)
  lines.push(centerLine("BIR TAX BREAKDOWN"));
  lines.push(padLine("VATable Sales:", `P ${fmtPeso(params.vatableSales || 0)}`));
  lines.push(padLine("12% VAT Amount:", `P ${fmtPeso(params.vatAmount || 0)}`));
  lines.push(padLine("VAT-Exempt Sales:", `P ${fmtPeso(params.vatExemptSales || 0)}`));
  lines.push(padLine("Zero-Rated Sales:", `P ${fmtPeso(params.zeroRatedSales || 0)}`));
  if (params.nonVatSales > 0) {
    lines.push(padLine("Non-VAT Sales:", `P ${fmtPeso(params.nonVatSales)}`));
  }
  lines.push(divider());

  lines.push(centerLine("PAYMENT METHOD BREAKDOWN"));
  lines.push(padLine("Cash Sales:", `P ${fmtPeso(params.cashSales)}`));
  lines.push(padLine("Credit / Charge Sales:", `P ${fmtPeso(params.creditSales)}`));
  lines.push(divider());

  lines.push(centerLine("AUDIT COUNTERS"));
  lines.push(padLine("Transaction Count:", String(params.transactionCount)));
  lines.push(padLine("Void Count:", String(params.voidCount)));
  lines.push(padLine("Return Count:", String(params.returnCount)));
  lines.push(doubleDivider());

  lines.push(centerLine("ACCUMULATED GRAND TOTALS"));
  lines.push(centerLine("(NON-RESETTABLE)"));
  lines.push(padLine("Previous Grand Total:", `P ${fmtPeso(params.oldGrandTotal)}`));
  lines.push(padLine("Current Day Gross Sales:", `P ${fmtPeso(params.dailyGrossSales)}`));
  lines.push(divider());
  lines.push(padLine("NEW GRAND TOTAL:", `P ${fmtPeso(params.newGrandTotal)}`));
  lines.push(doubleDivider());

  lines.push(centerLine("POS Software: Antigravity POS v2.0"));
  lines.push(centerLine("Accreditation No: 000-000000000-000000"));
  lines.push(doubleDivider());
  return lines.join("\n");
}

// ─── Browser Thermal Print Execution ───────────────────────────────────────────

export function printThermalMonospace(text: string): void {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Thermal Print</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    html, body {
      width: 80mm;
      margin: 0;
      padding: 2mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      white-space: pre-wrap;
      word-break: break-all;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    pre {
      font-family: inherit;
      font-size: inherit;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <pre>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:80mm;height:0;border:none;visibility:hidden;pointer-events:none;";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    } catch {
      /* ignore */
    }
  };

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (win) {
    const handlePrint = () => {
      try {
        win.focus();
        win.print();
      } catch (e) {
        console.error("Print thermal error:", e);
      }
      setTimeout(cleanup, 2000);
    };

    if (doc.readyState === "complete") {
      handlePrint();
    } else {
      win.addEventListener("load", handlePrint, { once: true });
      setTimeout(handlePrint, 250);
    }
  } else {
    setTimeout(cleanup, 2000);
  }
}
