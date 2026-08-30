/**
 * ESC/POS Binary Command Generator for 80mm Thermal Receipt Printers (42/48 Columns)
 * Generates raw byte arrays conforming to standard ESC/POS command specifications.
 */

import type { StoreSettings } from "@/shared/api/settingsApi";
import type { CartItem, CustomerInfo, SaleReceiptParams, CreditPaymentReceiptParams } from "@/modules/cashier/utils/receipt";
import type { ReturnReceiptData } from "@/shared/utils/returnReceiptPrinter";
import { cleanInvoiceNumber, type XReadingParams, type ZReadingParams } from "@/shared/utils/birReceiptFormatter";

const RECEIPT_WIDTH = 42; // Standard 80mm font A width in characters

// ESC/POS Command Byte Constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  /** Initialize printer / Reset all settings */
  init(): this {
    this.buffer.push(ESC, 0x40); // ESC @
    return this;
  }

  /** Select Code Page: CP437 (USA / Standard Europe) */
  setCodePageCP437(): this {
    this.buffer.push(ESC, 0x74, 0x00);
    return this;
  }

  /** Alignment: 0 = Left, 1 = Center, 2 = Right */
  align(alignment: "left" | "center" | "right"): this {
    const val = alignment === "center" ? 1 : alignment === "right" ? 2 : 0;
    this.buffer.push(ESC, 0x61, val);
    return this;
  }

  /** Bold toggle */
  bold(enable = true): this {
    this.buffer.push(ESC, 0x45, enable ? 1 : 0);
    return this;
  }

  /** Text Size: normal | doubleHeight | doubleWidth | doubleBoth */
  textSize(size: "normal" | "doubleHeight" | "doubleWidth" | "doubleBoth"): this {
    let val = 0x00;
    if (size === "doubleHeight") val = 0x01;
    else if (size === "doubleWidth") val = 0x10;
    else if (size === "doubleBoth") val = 0x11;
    this.buffer.push(GS, 0x21, val);
    return this;
  }

  /** Underline toggle */
  underline(enable = true): this {
    this.buffer.push(ESC, 0x2d, enable ? 1 : 0);
    return this;
  }

  /** Append raw text (ASCII / UTF-8 encoded, non-ASCII converted) */
  text(str: string): this {
    // Replace Philippine Peso sign '₱' with 'P' or code page equivalent
    const sanitized = str.replace(/₱/g, "P");
    for (let i = 0; i < sanitized.length; i++) {
      const code = sanitized.charCodeAt(i);
      if (code <= 0x7f) {
        this.buffer.push(code);
      } else {
        // Fallback for non-ASCII
        this.buffer.push(0x3f); // '?'
      }
    }
    return this;
  }

  /** Append text followed by a newline */
  textLine(str = ""): this {
    this.text(str);
    this.buffer.push(LF);
    return this;
  }

  /** Line feed N times */
  feed(lines = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(LF);
    }
    return this;
  }

  /** Print a horizontal dashed or solid divider */
  divider(char = "-", width = RECEIPT_WIDTH): this {
    this.align("left");
    this.textLine(char.repeat(width));
    return this;
  }

  /** Print a double divider */
  doubleDivider(width = RECEIPT_WIDTH): this {
    this.divider("=", width);
    return this;
  }

  /** Two-column row: Left-aligned and Right-aligned text fitting exactly 42 cols */
  row(left: string, right: string, width = RECEIPT_WIDTH): this {
    this.align("left");
    const l = String(left || "");
    const r = String(right || "");
    const available = width - r.length;
    if (l.length > available) {
      const truncated = l.slice(0, Math.max(0, available - 1)) + " ";
      this.textLine(truncated + r.padStart(width - truncated.length, " "));
    } else {
      this.textLine(l + r.padStart(width - l.length, " "));
    }
    return this;
  }

  /** Centered single line */
  center(str: string, width = RECEIPT_WIDTH): this {
    this.align("center");
    this.textLine(str);
    return this;
  }

  /** Auto-cut paper (Feed 5 lines then partial or full cut for cutter clearance) */
  cut(partial = true): this {
    this.feed(5);
    // GS V B 0 (Feed and Cut)
    this.buffer.push(GS, 0x56, partial ? 0x42 : 0x41, 0x00);
    return this;
  }

  /** Kick Cash Drawer Pin 2 (Standard ESC p 0 25 250) */
  cashDrawer(): this {
    this.buffer.push(ESC, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /** Sound Beeper / Chime (ESC B 2 2) */
  beep(count = 1): this {
    this.buffer.push(ESC, 0x42, count, 0x02);
    return this;
  }

  /** Export as Uint8Array for Web Serial transmission */
  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function fmtNum(n: number | null | undefined): string {
  return Number(n || 0).toFixed(2);
}

function formatTIN(settings: StoreSettings): string {
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted =
    cleanTin.length === 9
      ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
      : settings.tin || "000-000-000";
  const rawBranch = String(settings.branch_code || "").replace(/[^0-9]/g, "");
  if (rawBranch && rawBranch.trim() !== "") {
    const branchCode = rawBranch.padStart(Math.max(3, Math.min(rawBranch.length, 5)), "0");
    return `${tinFormatted}-${branchCode}`;
  }
  return tinFormatted;
}

// ─── Receipt Byte Builders ───────────────────────────────────────────────────

/**
 * Builds raw ESC/POS byte sequence for Sales Invoice
 */
export function buildSaleReceiptEscpos(params: SaleReceiptParams): Uint8Array {
  const {
    invoiceNumber,
    cartItems,
    customerInfo,
    cashCents,
    changeCents,
    cashierName,
    settings,
    discountCents = 0,
    discountName,
    discountPercentage,
    finalTotalCents = params.totalCents,
    vatExemptCents = 0,
    scPwdType = "NONE",
    scPwdId,
    itemSnapshots = [],
  } = params;

  const b = new EscPosBuilder();
  const curr = "";
  const storeName = settings.store_name || "HARDWARE STORE";
  const registeredName = settings.registered_taxpayer_name || "";
  const proprietor = settings.proprietor || "";
  const isVat = settings.vat_enabled ?? false;
  const storeTIN = formatTIN(settings);
  const posMin = settings.pos_min || "";
  const posSerial = settings.pos_serial || "";
  const ptuNo = settings.ptu_or_accn_no || "";
  const ptuDate = settings.ptu_date_issued ? ` Date: ${settings.ptu_date_issued}` : "";
  const docType = settings.document_type || "SALES INVOICE";

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const totalQty = cartItems.reduce((acc, i) => acc + i.quantity, 0);

  // Store Header
  b.doubleDivider();
  b.align("center").bold(true).textSize("doubleBoth").textLine(storeName);
  b.textSize("normal").bold(false);

  if (registeredName && registeredName !== storeName) {
    b.center(registeredName);
  }
  if (proprietor) {
    b.center(`Proprietor: ${proprietor}`);
  }
  if (settings.address) {
    b.center(settings.address);
  }
  b.center(`${isVat ? "VAT REG TIN" : "NON-VAT REG TIN"}: ${storeTIN}`);
  if (posMin || posSerial) {
    b.center(`${posMin ? `MIN: ${posMin}` : ""}${posMin && posSerial ? " | " : ""}${posSerial ? `S/N: ${posSerial}` : ""}`);
  }
  if (ptuNo) {
    b.center(`PTU No: ${ptuNo}${ptuDate}`);
  }
  if (settings.facebook || settings.contact_number) {
    const fb = settings.facebook ? `Fb: ${settings.facebook}` : "";
    const phone = settings.contact_number ? `Tel: ${settings.contact_number}` : "";
    b.center([fb, phone].filter(Boolean).join(" | "));
  }

  b.doubleDivider();
  b.align("center").bold(true).textLine(docType).bold(false);
  b.doubleDivider();

  // Transaction Meta
  b.row("SI No:", cleanInvoiceNumber(invoiceNumber));
  b.row("Date:", dateStr);
  b.row("Time:", timeStr);
  b.divider();

  // Customer Info
  const isBlank = (val?: string | null) => !val || !val.trim();
  const custName = !isBlank(customerInfo.name) ? customerInfo.name!.trim().toUpperCase() : "WALK-IN CUSTOMER";
  const custAddr = !isBlank(customerInfo.address) ? customerInfo.address!.trim().toUpperCase() : "____________________";
  const custTin = !isBlank(customerInfo.tin) ? customerInfo.tin!.trim().toUpperCase() : "____________________";
  const custBus = !isBlank(customerInfo.businessStyle) ? customerInfo.businessStyle!.trim().toUpperCase() : "____________________";
  const custScPwdId = !isBlank(scPwdId) ? scPwdId!.trim().toUpperCase() : "____________________";

  b.row("SOLD TO:", custName);
  if (scPwdType !== "NONE") {
    const scLabel = scPwdType === "SENIOR_CITIZEN" ? "OSCA ID:" : "PWD ID:";
    b.row(scLabel, custScPwdId);
  }
  b.row("TIN:", custTin);
  b.row("ADDRESS:", custAddr);
  b.row("BUS STYLE:", custBus);
  b.divider();

  // Items Header & Table
  b.row("QTY  UNIT  DESCRIPTION", "PRICE    AMOUNT");
  b.divider();

  for (const item of cartItems) {
    b.align("left").bold(true).textLine(item.name).bold(false);
    const qtyUnit = `${item.quantity} ${item.unit || "pc"}`.padEnd(10, " ");
    const priceStr = `@${fmtNum(item.unitPrice)}`;
    const amtStr = `${fmtNum(item.subtotal)}`;
    b.row(`${qtyUnit} ${priceStr}`, amtStr);
  }
  b.divider();

  const grossCents = cartItems.reduce((acc, item) => acc + Math.round(item.subtotal * 100), 0);
  b.row(`ITEMS: ${totalQty}`, `TOTAL: ${fmtCents(grossCents)}`);

  // Discount
  if (discountCents > 0) {
    const pctStr = discountPercentage ? ` (${discountPercentage}%)` : "";
    b.divider();
    b.row(`DISCOUNT: ${discountName || "Discount"}${pctStr}:`, `- ${fmtCents(discountCents)}`);
    b.row("NET TOTAL:", `${fmtCents(finalTotalCents)}`);
  }

  // Tax Breakdown
  let vatableNetCents = 0;
  let vatAmountCents = 0;
  let vatExemptCentsCalc = 0;
  let zeroRatedCents = 0;
  let nonTaxableCents = 0;

  if (isVat) {
    if (scPwdType !== "NONE") {
      vatAmountCents = 0;
      vatExemptCentsCalc =
        itemSnapshots
          .filter((s) => s.tax_type === "VAT_EXEMPT")
          .reduce((acc, s) => acc + Math.round(Number(s.line_subtotal) * 100), 0) + vatExemptCents;
    } else {
      vatableNetCents = itemSnapshots
        .filter((s) => s.tax_type === "VATABLE")
        .reduce((acc, s) => acc + Math.round(Number(s.taxable_amount) * 100), 0);
      vatAmountCents = params.taxCents;
      vatExemptCentsCalc = itemSnapshots
        .filter((s) => s.tax_type === "VAT_EXEMPT")
        .reduce((acc, s) => acc + Math.round(Number(s.line_subtotal) * 100), 0);
    }
  } else {
    nonTaxableCents = finalTotalCents;
  }

  b.divider();
  b.align("center").bold(true).textLine("TAX BREAKDOWN").bold(false);
  b.row("VATable Sales:", `${fmtCents(vatableNetCents)}`);
  b.row("12% VAT Amount:", `${fmtCents(vatAmountCents)}`);
  b.row("VAT-Exempt Sales:", `${fmtCents(vatExemptCentsCalc)}`);
  b.row("Zero-Rated Sales:", `${fmtCents(zeroRatedCents)}`);
  if (!isVat) {
    b.row("Non-VAT Sales:", `${fmtCents(nonTaxableCents)}`);
  }

  // Payment Breakdown
  b.divider();
  if (params.paymentType === "CREDIT") {
    b.bold(true).row("TOTAL AMOUNT DUE:", `${fmtCents(finalTotalCents)}`).bold(false);
    b.row("Payment Method:", "CREDIT / CHARGE");
    if (params.downPaymentCents && params.downPaymentCents > 0) {
      b.row("Down Payment (Cash):", `${fmtCents(params.downPaymentCents)}`);
      b.row("Charged to Account:", `${fmtCents(finalTotalCents - params.downPaymentCents)}`);
    } else {
      b.row("Charged to Account:", `${fmtCents(finalTotalCents)}`);
    }
    if (params.creditBalance !== undefined && params.creditBalance !== null) {
      b.bold(true).row("Total Account Balance:", `${fmtCents(params.creditBalance)}`).bold(false);
    }
    b.feed(1);
    b.center("________________________________________");
    b.center("CUSTOMER ACKNOWLEDGEMENT / SIGNATURE");
  } else {
    const dispChange = changeCents !== null ? changeCents : cashCents >= finalTotalCents ? cashCents - finalTotalCents : 0;
    b.bold(true).row("TOTAL AMOUNT DUE:", `${fmtCents(finalTotalCents)}`).bold(false);
    b.row("Cash Tendered:", `${fmtCents(cashCents)}`);
    b.row("Change:", `${fmtCents(dispChange)}`);
  }

  b.divider();
  b.row("CASHIER:", (cashierName || "—").toUpperCase());
  b.divider();
  const hasAccreditation = Boolean(settings.accreditation_no && settings.accreditation_no.trim() && settings.accreditation_no.trim() !== "000-000000000-000000");
  const accNo = hasAccreditation ? settings.accreditation_no!.trim() : "";
  const accDate = (hasAccreditation && settings.accreditation_date_issued) ? ` Date: ${settings.accreditation_date_issued}` : "";
  b.center("POS Software: ISRA POS System v1.0");
  if (hasAccreditation) {
    b.center(`Accreditation No: ${accNo}${accDate}`);
  }
  b.divider();

  b.align("center").bold(true).textLine("THIS SERVES AS AN OFFICIAL SALES INVOICE").bold(false);
  b.center("Thank you for your business!");

  b.cashDrawer(); // Pop cash drawer
  b.cut(true);     // Auto-cut paper

  return b.getBytes();
}

/**
 * Builds raw ESC/POS byte sequence for Credit Payment Receipt
 */
export function buildCreditPaymentReceiptEscpos(params: CreditPaymentReceiptParams): Uint8Array {
  const { receiptNumber, customerName, customerCode, amountPaidCents, newBalanceCents, cashierName, notes, settings } = params;
  const b = new EscPosBuilder();
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  b.doubleDivider();
  b.align("center").bold(true).textSize("doubleBoth").textLine(settings.store_name || "HARDWARE STORE");
  b.textSize("normal").bold(false);
  if (settings.address) b.center(settings.address);
  b.center(`TIN: ${formatTIN(settings)}`);
  b.doubleDivider();
  b.align("center").bold(true).textLine("COLLECTION RECEIPT").bold(false);
  b.doubleDivider();

  b.row("Receipt No:", receiptNumber);
  b.row("Date:", dateStr);
  b.row("Time:", timeStr);
  b.divider();

  b.bold(true).row("Received From:", (customerName || "").toUpperCase()).bold(false);
  if (customerCode) b.row("Customer Code:", customerCode.toUpperCase());
  if (notes) b.row("Notes:", notes.toUpperCase());
  b.divider();

  b.bold(true).row("AMOUNT PAID:", `${fmtCents(amountPaidCents)}`).bold(false);
  b.bold(true).row("REMAINING BALANCE:", `${fmtCents(newBalanceCents)}`).bold(false);
  b.divider();

  b.row("Received By:", (cashierName || "").toUpperCase());
  b.divider();
  b.center("Thank you for your payment!");
  b.center("We sincerely appreciate your trust");
  b.center("and look forward to serving you again!");

  b.cashDrawer();
  b.cut(true);

  return b.getBytes();
}

/**
 * Builds raw ESC/POS byte sequence for Return Receipt
 */
export function buildReturnReceiptEscpos(data: ReturnReceiptData): Uint8Array {
  const settings = data.settings;
  const b = new EscPosBuilder();
  const now = data.resolved_at ? new Date(data.resolved_at) : new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  b.doubleDivider();
  b.align("center").bold(true).textSize("doubleBoth").textLine(settings.store_name || "HARDWARE STORE");
  b.textSize("normal").bold(false);
  b.doubleDivider();
  b.align("center").bold(true).textLine("SALES RETURN RECEIPT").bold(false);
  b.doubleDivider();

  b.row("Return Slip No:", data.return_number);
  b.row("Original Invoice:", (data.invoice_number || "").replace(/^INV-?/i, "").trim());
  b.row("Date & Time:", `${dateStr} ${timeStr}`);
  b.row("Customer:", data.customer_name);
  b.divider();

  b.row("QTY  RETURNED ITEM", "PRICE    AMOUNT");
  b.divider();

  for (const item of data.items) {
    b.align("left").bold(true).textLine(item.product_name).bold(false);
    const qtyStr = `${item.quantity_returned} pc`.padEnd(10, " ");
    const upStr = `@${fmtNum(item.unit_price)}`;
    const amtStr = `${fmtNum(item.unit_price * item.quantity_returned)}`;
    b.row(`${qtyStr} ${upStr}`, amtStr);
  }
  b.divider();

  if (data.resolution === "refund") {
    const cashRefund = Number(data.cash_refund_amount ?? data.refund_amount ?? 0);
    const creditRefund = Number(data.credit_refund_amount ?? 0);
    b.row("TOTAL RETURN VALUE:", `${fmtNum(cashRefund + creditRefund)}`);
    if (creditRefund > 0) b.row("CREDIT DEBT REDUCED:", `${fmtNum(creditRefund)}`);
    b.bold(true).row("CASH REFUNDED:", `${fmtNum(cashRefund)}`).bold(false);
    if (data.customer_balance !== undefined && data.customer_balance !== null) {
      b.row("REMAINING BALANCE:", `${fmtNum(data.customer_balance)}`);
    }
  } else if (data.resolution === "exchange") {
    b.align("left").textLine(`EXCHANGE BARCODE: ${data.exchange_barcode || "N/A"}`);
    b.textLine(`EXCHANGE QTY: ${data.exchange_quantity || 1}`);
    if (data.additional_payment && data.additional_payment > 0) {
      b.row("ADDITIONAL PAYMENT:", `${fmtNum(data.additional_payment)}`);
    }
    if (data.refund_difference && data.refund_difference > 0) {
      b.row("REFUND DIFFERENCE:", `${fmtNum(data.refund_difference)}`);
    }
  }

  b.divider();
  b.row("PROCESSED BY:", data.processed_by_name);
  b.divider();
  b.center("Thank you for your business.");

  b.cut(true);
  return b.getBytes();
}

/**
 * Builds raw ESC/POS byte sequence for plain text thermal reports (X-Reading / Z-Reading)
 */
export function buildPlainTextEscpos(text: string): Uint8Array {
  const b = new EscPosBuilder();
  const lines = text.split("\n");
  for (const line of lines) {
    b.textLine(line);
  }
  b.cut(true);
  return b.getBytes();
}

/**
 * Builds a sample Test Receipt for verifying thermal printer connectivity
 */
export function buildTestReceiptEscpos(storeName = "ISRA HARDWARE POS"): Uint8Array {
  const b = new EscPosBuilder();
  b.init();
  b.doubleDivider();
  b.align("center").bold(true).textSize("doubleBoth").textLine(storeName);
  b.textSize("normal").bold(false);
  b.center("*** DIRECT USB ESC/POS TEST ***");
  b.doubleDivider();
  b.row("Direct USB Print:", "SUCCESSFUL (0% FLASH)");
  b.row("Baud Rate:", "CONNECTED");
  b.row("Test Date:", new Date().toLocaleDateString("en-PH"));
  b.row("Test Time:", new Date().toLocaleTimeString("en-PH"));
  b.divider();
  b.center("Your thermal printer is ready for");
  b.center("high-speed silent receipt printing!");
  b.doubleDivider();
  b.cashDrawer();
  b.cut(true);
  return b.getBytes();
}
