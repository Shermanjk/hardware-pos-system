import type { TaxType } from "@/shared/api/productsApi";
import type { SaleItemSnapshot } from "@/shared/api/salesApi";
import type { StoreSettings } from "@/shared/api/settingsApi";
import { buildCreditPaymentReceiptEscpos, buildSaleReceiptEscpos } from "@/shared/services/escpos/escposBuilder";
import { localPrintAgent } from "@/shared/services/escpos/localPrintAgent";
import { webSerialPrinter } from "@/shared/services/escpos/webSerialPrinter";
import { printHtmlSilently } from "@/shared/utils/silentHtmlPrinter";
import { rasterizeReceiptHtml } from "@/shared/utils/receiptHtmlRasterizer";
import { toCentavos } from "./money";

export function cleanInvoiceNumber(inv?: string | null): string {
  if (!inv) return "";
  return String(inv).replace(/^INV-?/i, "").trim();
}

export interface CartItem {
  id: number;
  name: string;
  barcode?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax_type: TaxType;
  tax_rate?: number;
  taxable_amount?: number;
  vat_amount?: number;
  /** Available stock at time of adding — used to cap quantity input */
  stock?: number;
}

export interface CustomerInfo {
  name: string;
  address: string;
  tin: string;
  businessStyle: string;
  scPwdType?: "NONE" | "SENIOR_CITIZEN" | "PWD";
  scPwdId?: string;
}

export interface SaleReceiptParams {
  invoiceNumber: string;
  cartItems: CartItem[];
  customerInfo: CustomerInfo;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  cashCents: number;
  changeCents: number | null;
  cashierName: string;
  settings: StoreSettings;
  itemSnapshots: SaleItemSnapshot[];
  discountCents?: number;
  discountName?: string;
  discountPercentage?: number;
  finalTotalCents?: number;
  /** VAT-exempt amount for SC/PWD transactions (VAT-exclusive base). Defaults to 0 for regular customers. */
  vatExemptCents?: number;
  /** SC/PWD type — "NONE" for regular customers. */
  scPwdType?: "NONE" | "SENIOR_CITIZEN" | "PWD";
  /** SC/PWD ID number — required for SC/PWD transactions. */
  scPwdId?: string;
  /** Payment type — "CASH" or "CREDIT". Defaults to "CASH". */
  paymentType?: "CASH" | "CREDIT";
  /** Customer's total outstanding balance in centavos after this transaction (credit sales). */
  creditBalance?: number | null;
  /** Down payment amount in centavos (credit sales). */
  downPaymentCents?: number;
  /** Terminal Code (e.g. "TERM-01") */
  terminalId?: string;
  /** Terminal BIR MIN override */
  posMin?: string;
  /** Terminal Hardware S/N override */
  posSerial?: string;
}

export interface CreditPaymentReceiptParams {
  receiptNumber: string;
  customerName: string;
  customerCode?: string;
  amountPaidCents: number;
  newBalanceCents: number;
  cashierName: string;
  notes?: string;
  settings: StoreSettings;
  terminalId?: string;
  posMin?: string;
  posSerial?: string;
}

function buildReceiptHTML(params: SaleReceiptParams): string {
  const {
    invoiceNumber, cartItems, customerInfo,
    subtotalCents, taxCents, totalCents,
    cashCents, changeCents, cashierName, settings,
    discountCents = 0, discountName, discountPercentage, finalTotalCents = totalCents,
    vatExemptCents = 0, scPwdType = "NONE", scPwdId,
  } = params;

  const isScPwd = scPwdType !== "NONE";
  const grossCents = cartItems.reduce((acc, item) => acc + toCentavos(item.subtotal), 0);
  const displayTaxCents = isScPwd ? 0 : taxCents;
  const displayChangeCents = changeCents !== null ? changeCents : (cashCents >= finalTotalCents ? cashCents - finalTotalCents : 0);
  const scPwdLabel = scPwdType === "SENIOR_CITIZEN" ? "OSCA ID" : scPwdType === "PWD" ? "PWD ID" : "";

  const storeName = settings.store_name || "ISRA HARDWARE TRADING";
  const proprietor = settings.proprietor || "";
  const storeFb = settings.facebook || "";
  const storePhone = settings.contact_number || "";
  const storeAddress = settings.address || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : (settings.tin || "000-000-000");
  const rawBranch = String(settings.branch_code || "").replace(/[^0-9]/g, "");
  const storeTIN = (rawBranch && rawBranch.trim() !== "") ? `${tinFormatted}-${rawBranch.padStart(Math.max(3, Math.min(rawBranch.length, 5)), "0")}` : tinFormatted;
  const ptuNo = settings.ptu_or_accn_no || "";
  const ptuDate = settings.ptu_date_issued ? ` Date: ${settings.ptu_date_issued}` : "";
  const hasAccreditation = Boolean(settings.accreditation_no && settings.accreditation_no.trim() && settings.accreditation_no.trim() !== "000-000000000-000000");
  const accNo = hasAccreditation ? settings.accreditation_no!.trim() : "";
  const accDate = (hasAccreditation && settings.accreditation_date_issued) ? ` Date: ${settings.accreditation_date_issued}` : "";
  const documentType = settings.document_type || "SALES INVOICE";
  const currSym = "";
  const posMin = params.posMin ?? settings.pos_min ?? "";
  const posSerial = params.posSerial ?? settings.pos_serial ?? "";
  const terminalId = params.terminalId ?? "";

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = now.getFullYear();
  const dateStr = `${mm}/${dd}/${yyyy}`;

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);

  const fmtCents = (cents: number) => {
    if (!Number.isFinite(cents)) {
      throw new Error(`[Receipt Error] fmtCents called with invalid non-finite value: ${cents}`);
    }
    return (cents / 100).toFixed(2);
  };

  const isBlank = (val?: string | null) => !val || !val.trim();
  const tinVal = !isBlank(customerInfo.tin) ? customerInfo.tin!.trim().toUpperCase() : "____________________";
  const addrVal = !isBlank(customerInfo.address) ? customerInfo.address!.trim().toUpperCase() : "____________________";
  const busVal = !isBlank(customerInfo.businessStyle) ? customerInfo.businessStyle!.trim().toUpperCase() : "____________________";
  const scPwdIdVal = !isBlank(scPwdId) ? scPwdId!.trim().toUpperCase() : "____________________";
  const custNameVal = !isBlank(customerInfo.name) ? customerInfo.name!.trim().toUpperCase() : "WALK-IN CUSTOMER";

  const itemsHTML = cartItems.map(item => {
    const qty = item.quantity;
    const unit = item.unit || "pc";
    const desc = item.name;
    const amt = fmtCents(toCentavos(item.subtotal));
    return `<tr class="item-row">
      <td class="col-qty">${qty}</td>
      <td class="col-unit">${unit}</td>
      <td class="col-desc">${desc}</td>
      <td class="col-amt">${amt}</td>
    </tr>`;
  }).join("");

  const snaps = params.itemSnapshots || [];
  let vatableNetCents = 0;
  let vatAmountCents = 0;
  let vatExemptCentsCalculated = 0;
  let zeroRatedCents = 0;
  let nonTaxableCents = 0;

  if (settings.vat_enabled) {
    if (isScPwd) {
      vatAmountCents = 0;
      vatExemptCentsCalculated = snaps
        .filter((s) => s.tax_type === "VAT_EXEMPT")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0) + vatExemptCents;
      zeroRatedCents = snaps
        .filter((s) => s.tax_type === "ZERO_RATED")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
      nonTaxableCents = snaps
        .filter((s) => s.tax_type === "NON_TAXABLE")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
    } else {
      vatableNetCents = snaps
        .filter((s) => s.tax_type === "VATABLE")
        .reduce((acc, s) => acc + toCentavos(Number(s.taxable_amount)), 0);
      vatAmountCents = displayTaxCents;
      vatExemptCentsCalculated = snaps
        .filter((s) => s.tax_type === "VAT_EXEMPT")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
      zeroRatedCents = snaps
        .filter((s) => s.tax_type === "ZERO_RATED")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
      nonTaxableCents = snaps
        .filter((s) => s.tax_type === "NON_TAXABLE")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
    }
  } else {
    nonTaxableCents = finalTotalCents;
  }

  const vatBreakdownHTML = `
  <div class="divider"></div>
  <div class="row"><span>VATable Sales:</span><span>${fmtCents(vatableNetCents)}</span></div>
  <div class="row"><span>12% VAT Amount:</span><span>${fmtCents(vatAmountCents)}</span></div>
  <div class="row"><span>VAT-Exempt Sales:</span><span>${fmtCents(vatExemptCentsCalculated)}</span></div>
  <div class="row"><span>Zero-Rated Sales:</span><span>${fmtCents(zeroRatedCents)}</span></div>
  ${nonTaxableCents > 0 && !settings.vat_enabled ? `<div class="row"><span>Non-VAT Sales:</span><span>${fmtCents(nonTaxableCents)}</span></div>` : ''}`;

  let discountHTML = "";
  if (discountCents > 0) {
    const pctStr = discountPercentage ? ` (${discountPercentage}%)` : "";
    discountHTML = `
    <div class="divider"></div>
    <div class="row"><span>DISCOUNT: ${discountName || "Discount"}${pctStr}:</span><span>-${fmtCents(discountCents)}</span></div>
    <div class="divider"></div>
    <div class="row"><span>GROSS TOTAL:</span><span>${fmtCents(grossCents)}</span></div>
    <div class="row"><span>VAT-EXEMPT AMOUNT:</span><span>${fmtCents(isScPwd ? vatExemptCents : 0)}</span></div>
    <div class="row"><span>NET TOTAL:</span><span>${fmtCents(finalTotalCents)}</span></div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
      font-family: 'Consolas', 'Courier New', Courier, monospace;
      font-size: 12px;
      font-weight: 530;
      line-height: 1.35;
      color: #000;
      background: #fff;
      overflow-x: hidden;
      -webkit-font-smoothing: none;
      text-rendering: crispEdges;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 0; background: #fff; }
    .receipt {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      padding: 0 1mm 15mm 1mm;
      box-sizing: border-box;
      background: #fff;
    }
    .center { text-align: center; margin: 2px 0; word-break: break-word; }
    .row { display: flex; justify-content: space-between; align-items: baseline; margin: 2.5px 0; word-break: break-word; }
    .row span:first-child { flex: 1 1 auto; padding-right: 4px; min-width: 0; }
    .row span:last-child { flex: 0 0 auto; white-space: nowrap; text-align: right; padding-right: 0; max-width: 60%; }
    
    .section { margin: 2.5px 0; word-break: break-word; }
    .bold { font-weight: bold; }
    .store-name { text-align: center; margin: 2px 0 3px 0; font-size: 15px; font-weight: bold; letter-spacing: 0.5px; word-break: break-word; }
    .header-info { font-size: 11.5px; font-weight: 530; line-height: 1.35; text-align: center; margin-bottom: 4px; }
    .divider { border-top: 1.5px dashed #000; margin: 9px 0 10px 0; }
    
    .items {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 6px 0;
    }
    .items th,
    .items td {
      vertical-align: top;
      padding: 2px 0;
      box-sizing: border-box;
    }
    .items th {
      font-size: 11px;
      font-weight: 530;
      padding-top: 3px;
      padding-bottom: 8px;
    }
    .items tr.header-divider-row td {
      padding: 0;
      height: 1px;
      border-bottom: 1.5px dashed #000;
    }
    .items tbody tr.item-row:first-child td {
      padding-top: 8px;
    }
    .items tbody tr.item-row td {
      padding-top: 2.5px;
      padding-bottom: 2.5px;
      font-size: 12px;
      font-weight: 530;
    }
    .items .col-qty {
      width: 11%;
      text-align: left;
      white-space: nowrap;
    }
    .items .col-unit {
      width: 14%;
      text-align: left;
      white-space: nowrap;
    }
    .items .col-desc {
      width: 49%;
      text-align: left;
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-word;
      padding-right: 4px;
    }
    .items .col-amt {
      width: 26%;
      text-align: right;
      white-space: nowrap;
      padding-right: 0;
    }
    
    @media print {
      html, body { width: 80mm; margin: 0; padding: 0; }
      .receipt { width: 76mm; max-width: 76mm; margin: 0 auto; padding: 0 1mm 15mm 1mm; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="store-name">${storeName}</div>
    <div class="header-info">
      ${proprietor ? `<div class="center">Proprietor: ${proprietor}</div>` : ''}
      ${registeredTaxpayerName && registeredTaxpayerName !== proprietor ? `<div class="center">${registeredTaxpayerName}</div>` : ''}
      ${storeAddress ? `<div class="center">${storeAddress}</div>` : ''}
      <div class="center">${settings.vat_enabled ? 'VAT REG TIN' : 'NON-VAT REG TIN'}: ${storeTIN || "[TIN NOT CONFIGURED]"}</div>
      ${(posMin || posSerial) ? `<div class="center">${posMin ? `MIN: ${posMin}` : ''}${posMin && posSerial ? ' | ' : ''}${posSerial ? `S/N: ${posSerial}` : ''}</div>` : ''}
      ${ptuNo ? `<div class="center">PTU No: ${ptuNo}${ptuDate}</div>` : ''}
      ${(storeFb || storePhone) ? `<div class="center">${storeFb ? `Fb: ${storeFb}` : ''}${storeFb && storePhone ? ' | ' : ''}${storePhone ? `Tel No: ${storePhone}` : ''}</div>` : ''}
    </div>
    
    <div class="center bold" style="margin: 8px 0 6px 0; font-size: 15px; letter-spacing: 0.5px;">${documentType}</div>
    
    <div class="row"><span>SI No: ${cleanInvoiceNumber(invoiceNumber)}</span></div>
    <div class="row"><span style="white-space:nowrap;">Date:  ${dateStr}</span><span style="white-space:nowrap; padding-right: 2px;">Time: ${timeStr}</span></div>
    <div class="divider"></div>
    <table class="items">
      <thead>
        <tr>
          <th class="col-qty">QTY</th>
          <th class="col-unit">UNIT</th>
          <th class="col-desc">DESCRIPTION</th>
          <th class="col-amt">AMOUNT</th>
        </tr>
        <tr class="header-divider-row">
          <td colspan="4"></td>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
    
    <div class="row" style="margin-top: 5px;"><span>ITEMS: ${totalItems}</span><span>TOTAL:&nbsp;&nbsp;${fmtCents(grossCents)}</span></div>
    ${discountHTML}
    ${vatBreakdownHTML}
    
    <div style="margin: 6px 0;"></div>
    ${params.paymentType === "CREDIT" ? `
    <div class="row"><span>TOTAL AMOUNT:</span><span>${fmtCents(finalTotalCents)}</span></div>
    <div class="row"><span>PAYMENT METHOD:</span><span>CREDIT / CHARGE</span></div>
    ${(params.downPaymentCents && params.downPaymentCents > 0) ? `
    <div class="row"><span>Down Payment (Cash):</span><span>${fmtCents(params.downPaymentCents)}</span></div>
    <div class="row"><span>Charged to Account:</span><span>${fmtCents(finalTotalCents - params.downPaymentCents)}</span></div>
    ` : `
    <div class="row"><span>Charged to Account:</span><span>${fmtCents(finalTotalCents)}</span></div>
    `}
    ${params.creditBalance !== undefined && params.creditBalance !== null ? `
    <div class="row"><span>Total Account Balance:</span><span>${fmtCents(params.creditBalance)}</span></div>
    ` : ''}
    <div class="divider"></div>
    <div class="section" style="margin-top: 14px; margin-bottom: 4px;">
      <div style="border-bottom: 1.5px solid #000; width: 80%; margin: 12px auto 4px auto;"></div>
      <div class="center" style="font-size: 10px;">CUSTOMER ACKNOWLEDGEMENT / SIGNATURE</div>
    </div>
    ` : `
    <div class="row"><span>TOTAL AMOUNT DUE:</span><span>${fmtCents(finalTotalCents)}</span></div>
    <div class="row"><span>Cash Tendered:</span><span>${fmtCents(cashCents)}</span></div>
    <div class="row"><span>Change:</span><span>${fmtCents(displayChangeCents)}</span></div>
    `}
    <div class="divider"></div>
    <div class="row"><span style="width: 80px; flex-shrink: 0;">SOLD TO:</span><span style="flex: 1; text-align: left;">${custNameVal}</span></div>
    ${scPwdType !== "NONE" ? `<div class="row"><span style="width: 80px; flex-shrink: 0;">${scPwdLabel}:</span><span style="flex: 1; text-align: left;">${scPwdIdVal}</span></div>` : ''}
    <div class="row"><span style="width: 80px; flex-shrink: 0;">TIN:</span><span style="flex: 1; text-align: left;">${tinVal}</span></div>
    <div class="row"><span style="width: 80px; flex-shrink: 0;">ADDRESS:</span><span style="flex: 1; text-align: left;">${addrVal}</span></div>
    <div class="row"><span style="width: 80px; flex-shrink: 0;">BUS STYLE:</span><span style="flex: 1; text-align: left;">${busVal}</span></div>
    <div class="divider"></div>
    <div class="section">CASHIER: ${(cashierName || "—").toUpperCase()}</div>
    <div class="divider"></div>
    <div class="center" style="font-size: 11px;">POS Software: ISRA POS System v1.0</div>
    ${hasAccreditation ? `<div class="center" style="font-size: 11px;">Accreditation No: ${accNo}${accDate}</div>` : ''}
    <div class="divider"></div>
    <div class="center">Thank you for your business.</div>
    <div class="center">We sincerely appreciate your trust</div>
    <div class="center">and look forward to serving you again!</div>
    <div style="margin-top: 3px;"></div>
    <div class="center" style="font-size: 11px;">THIS SERVES AS AN OFFICIAL SALES INVOICE</div>
    ${settings.receipt_footer ? `<div class="center" style="font-size: 11px; margin-top: 2px;">${settings.receipt_footer}</div>` : ''}
    <div style="height: 15mm; line-height: 15mm;">&nbsp;</div>
  </div>
</body>
</html>`;
}



export function buildSaleReceiptText(params: SaleReceiptParams): string {
  const {
    invoiceNumber, cartItems, customerInfo,
    taxCents, totalCents,
    cashCents, changeCents, cashierName, settings,
    discountCents = 0, discountName, discountPercentage, finalTotalCents = totalCents,
    vatExemptCents = 0, scPwdType = "NONE", scPwdId,
    paymentType = "CASH", creditBalance, downPaymentCents = 0
  } = params;

  const isScPwd = scPwdType !== "NONE";
  const displayTaxCents = isScPwd ? 0 : taxCents;
  const displayChangeCents = changeCents !== null ? changeCents : (cashCents >= finalTotalCents ? cashCents - finalTotalCents : 0);
  const scPwdLabel = scPwdType === "SENIOR_CITIZEN" ? "OSCA ID" : scPwdType === "PWD" ? "PWD ID" : "";

  const storeName = settings.store_name || "ISRA HARDWARE TRADING";
  const proprietor = settings.proprietor || "";
  const storeAddress = settings.address || "";
  const storePhone = settings.contact_number || "";
  const storeFb = settings.facebook || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : (settings.tin || "000-000-000");
  const rawBranch = String(settings.branch_code || "").replace(/[^0-9]/g, "");
  const storeTIN = (rawBranch && rawBranch.trim() !== "") ? `${tinFormatted}-${rawBranch.padStart(Math.max(3, Math.min(rawBranch.length, 5)), "0")}` : tinFormatted;
  const ptuNo = settings.ptu_or_accn_no || "";
  const posMin = params.posMin ?? settings.pos_min ?? "";
  const posSerial = params.posSerial ?? settings.pos_serial ?? "";
  const terminalId = params.terminalId ?? "";
  const documentType = settings.document_type || "SALES INVOICE";
  const currSym = "";

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmt = (cents: number) => (cents / 100).toFixed(2);
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);
  const grossCents = cartItems.reduce((acc, item) => acc + toCentavos(item.subtotal), 0);

  const snaps = params.itemSnapshots || [];
  let vatableNetCents = 0;
  let vatAmountCents = 0;
  let vatExemptCentsCalculated = 0;
  let zeroRatedCents = 0;
  let nonTaxableCents = 0;

  if (settings.vat_enabled) {
    if (isScPwd) {
      vatAmountCents = 0;
      vatExemptCentsCalculated = snaps
        .filter((s) => s.tax_type === "VAT_EXEMPT")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0) + vatExemptCents;
      zeroRatedCents = snaps
        .filter((s) => s.tax_type === "ZERO_RATED")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
      nonTaxableCents = snaps
        .filter((s) => s.tax_type === "NON_TAXABLE")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
    } else {
      vatableNetCents = snaps
        .filter((s) => s.tax_type === "VATABLE")
        .reduce((acc, s) => acc + toCentavos(Number(s.taxable_amount)), 0);
      vatAmountCents = snaps
        .filter((s) => s.tax_type === "VATABLE")
        .reduce((acc, s) => acc + toCentavos(Number(s.vat_amount)), 0);
      vatExemptCentsCalculated = snaps
        .filter((s) => s.tax_type === "VAT_EXEMPT")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
      zeroRatedCents = snaps
        .filter((s) => s.tax_type === "ZERO_RATED")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
      nonTaxableCents = snaps
        .filter((s) => s.tax_type === "NON_TAXABLE")
        .reduce((acc, s) => acc + toCentavos(Number(s.line_subtotal)), 0);
    }
  } else {
    nonTaxableCents = finalTotalCents;
  }

  const lines: string[] = [];
  lines.push("----------------------------------------");
  lines.push(storeName.toUpperCase());
  if (registeredTaxpayerName) lines.push(registeredTaxpayerName);
  if (proprietor) lines.push(`PROPRIETOR: ${proprietor}`);
  lines.push(`${settings.vat_enabled ? 'VAT REGISTERED' : 'NON-VAT REGISTERED'} | TIN: ${storeTIN}`);
  if (posMin || posSerial) lines.push(`MIN: ${posMin} | S/N: ${posSerial}`);
  if (ptuNo) lines.push(`PTU / ACCN: ${ptuNo}`);
  if (storeFb || storePhone) lines.push(`Fb: ${storeFb} | Tel: ${storePhone}`);
  lines.push("----------------------------------------");
  lines.push(`              ${documentType}`);
  lines.push(`SI No:          ${cleanInvoiceNumber(invoiceNumber)}`);
  lines.push(`Date:           ${dateStr}`);
  lines.push(`Time:           ${timeStr}`);
  lines.push(`Cashier:        ${(cashierName || "").toUpperCase()}`);
  if (terminalId) lines.push(`Terminal:       ${terminalId.toUpperCase()}`);
  lines.push("----------------------------------------");
  lines.push("QTY  UNIT  DESCRIPTION        PRICE    TOTAL");
  lines.push("----------------------------------------");

  for (const item of cartItems) {
    lines.push(item.name);
    const qtyStr = item.quantity.toString().padEnd(4);
    const unitStr = (item.unit || "").slice(0, 5).padEnd(5);
    const priceStr = `${fmt(toCentavos(item.unitPrice))}`.padStart(12);
    const totalStr = `${fmt(toCentavos(item.subtotal))}`.padStart(15);
    lines.push(`${qtyStr} ${unitStr} ${priceStr} ${totalStr}`);
  }

  lines.push("----------------------------------------");
  lines.push(`ITEMS: ${totalItems}              TOTAL: ${fmt(grossCents)}`);

  if (discountCents > 0) {
    const dLabel = discountName || (discountPercentage ? `${discountPercentage}%` : "Discount");
    lines.push("----------------------------------------");
    lines.push(`DISCOUNT (${dLabel}):         -${fmt(discountCents)}`);
    lines.push(`GROSS TOTAL:                   ${fmt(grossCents)}`);
    lines.push(`NET TOTAL:                     ${fmt(finalTotalCents)}`);
  }

  lines.push("----------------------------------------");
  lines.push("             TAX BREAKDOWN");
  lines.push(`VATable Sales:                 ${fmt(vatableNetCents)}`);
  lines.push(`12% VAT Amount:                ${fmt(vatAmountCents)}`);
  lines.push(`VAT-Exempt Sales:              ${fmt(vatExemptCentsCalculated)}`);
  lines.push(`Zero-Rated Sales:              ${fmt(zeroRatedCents)}`);
  if (nonTaxableCents > 0 && !settings.vat_enabled) {
    lines.push(`Non-VAT Sales:                 ${fmt(nonTaxableCents)}`);
  }

  lines.push("----------------------------------------");
  if (paymentType === "CREDIT") {
    lines.push(`TOTAL AMOUNT:                  ${fmt(finalTotalCents)}`);
    lines.push(`PAYMENT METHOD:                CREDIT / CHARGE`);
    if (downPaymentCents > 0) {
      lines.push(`Down Payment (Cash):           ${fmt(downPaymentCents)}`);
      lines.push(`Charged to Account:            ${fmt(finalTotalCents - downPaymentCents)}`);
    } else {
      lines.push(`Charged to Account:            ${fmt(finalTotalCents)}`);
    }
    if (creditBalance !== undefined && creditBalance !== null) {
      lines.push(`Total Account Balance:         ${fmt(creditBalance)}`);
    }
    lines.push("----------------------------------------");
    lines.push("   CUSTOMER ACKNOWLEDGEMENT / SIGNATURE");
    lines.push("\n   _____________________________________\n");
  } else {
    lines.push(`TOTAL AMOUNT DUE:              ${fmt(finalTotalCents)}`);
    lines.push(`Cash Tendered:                 ${fmt(cashCents)}`);
    lines.push(`Change:                        ${fmt(displayChangeCents)}`);
  }

  const isBlank = (val?: string | null) => !val || !val.trim();
  const custName = !isBlank(customerInfo.name) ? customerInfo.name!.trim().toUpperCase() : "WALK-IN CUSTOMER";
  const custTin = !isBlank(customerInfo.tin) ? customerInfo.tin!.trim().toUpperCase() : "____________________";
  const custAddr = !isBlank(customerInfo.address) ? customerInfo.address!.trim().toUpperCase() : "____________________";
  const custBus = !isBlank(customerInfo.businessStyle) ? customerInfo.businessStyle!.trim().toUpperCase() : "____________________";
  const custScPwdId = !isBlank(scPwdId) ? scPwdId!.trim().toUpperCase() : "____________________";

  lines.push("----------------------------------------");
  lines.push(`SOLD TO: ${custName}`);
  if (scPwdType !== "NONE") lines.push(`${scPwdLabel}: ${custScPwdId}`);
  lines.push(`TIN: ${custTin}`);
  lines.push(`ADDRESS: ${custAddr}`);
  lines.push(`BUSINESS STYLE: ${custBus}`);
  lines.push("----------------------------------------");
  lines.push(`CASHIER: ${(cashierName || "—").toUpperCase()}`);
  lines.push("----------------------------------------");
  const hasAccreditation = Boolean(settings.accreditation_no && settings.accreditation_no.trim() && settings.accreditation_no.trim() !== "000-000000000-000000");
  const accNo = hasAccreditation ? settings.accreditation_no!.trim() : "";
  const accDate = (hasAccreditation && settings.accreditation_date_issued) ? ` Date: ${settings.accreditation_date_issued}` : "";
  lines.push("       POS Software: ISRA POS System v1.0");
  if (hasAccreditation) {
    lines.push(`     Accreditation No: ${accNo}${accDate}`);
  }
  lines.push("----------------------------------------");
  lines.push("       Thank you for your business.");
  lines.push("   We sincerely appreciate your trust");
  lines.push("  and look forward to serving you again!");
  lines.push("----------------------------------------");
  lines.push("    THIS SERVES AS AN OFFICIAL SALES INVOICE");
  if (settings.receipt_footer) lines.push(`    ${settings.receipt_footer}`);
  lines.push("\n\n\n\n\n");

  return lines.join("\n");
}

export function buildCreditPaymentReceiptText(params: CreditPaymentReceiptParams): string {
  const {
    receiptNumber, customerName, customerCode,
    amountPaidCents, newBalanceCents, cashierName,
    notes, settings,
  } = params;

  const storeName = settings.store_name || "ISRA HARDWARE TRADING";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const storeAddress = settings.address || "";
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : (settings.tin || "000-000-000");
  const rawBranch = String(settings.branch_code || "").replace(/[^0-9]/g, "");
  const storeTIN = (rawBranch && rawBranch.trim() !== "") ? `${tinFormatted}-${rawBranch.padStart(Math.max(3, Math.min(rawBranch.length, 5)), "0")}` : tinFormatted;
  const posMin = params.posMin ?? settings.pos_min ?? "";
  const posSerial = params.posSerial ?? settings.pos_serial ?? "";
  const terminalId = params.terminalId ?? "";
  const currSym = "";

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmt = (cents: number) => (cents / 100).toFixed(2);

  const lines: string[] = [];
  lines.push("----------------------------------------");
  lines.push(storeName.toUpperCase());
  if (registeredTaxpayerName) lines.push(registeredTaxpayerName);
  if (storeAddress) lines.push(storeAddress);
  lines.push(`${settings.vat_enabled ? 'VAT REGISTERED' : 'NON-VAT REGISTERED'} | TIN: ${storeTIN}`);
  if (posMin || posSerial) lines.push(`MIN: ${posMin} | S/N: ${posSerial}`);
  lines.push("----------------------------------------");
  lines.push("  COLLECTION RECEIPT / PAYMENT ACKNOWLEDGEMENT");
  lines.push(`Receipt No:     ${receiptNumber}`);
  lines.push(`Date:           ${dateStr}`);
  lines.push(`Time:           ${timeStr}`);
  lines.push(`Cashier:        ${(cashierName || "").toUpperCase()}`);
  if (terminalId) lines.push(`Terminal:       ${terminalId.toUpperCase()}`);
  lines.push("----------------------------------------");
  lines.push(`Received From:  ${(customerName || "").toUpperCase()}`);
  if (customerCode) lines.push(`Customer Code:  ${customerCode.toUpperCase()}`);
  if (notes) lines.push(`Notes:          ${notes.toUpperCase()}`);
  lines.push("----------------------------------------");
  lines.push(`AMOUNT PAID:                   ${fmt(amountPaidCents)}`);
  lines.push(`REMAINING BALANCE:             ${fmt(newBalanceCents)}`);
  lines.push("----------------------------------------");
  lines.push(`Received By:    ${(cashierName || "").toUpperCase()}`);
  lines.push("----------------------------------------");
  lines.push("       Thank you for your payment!");
  lines.push("   We sincerely appreciate your trust");
  lines.push("  and look forward to serving you again!");
  lines.push("\n\n\n\n\n");

  return lines.join("\n");
}

export function buildCreditPaymentReceiptHTML(params: CreditPaymentReceiptParams): string {
  const {
    receiptNumber, customerName, customerCode,
    amountPaidCents, newBalanceCents, cashierName,
    notes, settings,
  } = params;

  const storeName = settings.store_name || "ISRA HARDWARE TRADING";
  const proprietor = settings.proprietor || "";
  const storeFb = settings.facebook || "";
  const storePhone = settings.contact_number || "";
  const storeAddress = settings.address || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : (settings.tin || "000-000-000");
  const rawBranch = String(settings.branch_code || "").replace(/[^0-9]/g, "");
  const storeTIN = (rawBranch && rawBranch.trim() !== "") ? `${tinFormatted}-${rawBranch.padStart(Math.max(3, Math.min(rawBranch.length, 5)), "0")}` : tinFormatted;
  const ptuNo = settings.ptu_or_accn_no || "";
  const ptuDate = settings.ptu_date_issued ? ` Date: ${settings.ptu_date_issued}` : "";
  const hasAccreditation = Boolean(settings.accreditation_no && settings.accreditation_no.trim() && settings.accreditation_no.trim() !== "000-000000000-000000");
  const accNo = hasAccreditation ? settings.accreditation_no!.trim() : "";
  const accDate = (hasAccreditation && settings.accreditation_date_issued) ? ` Date: ${settings.accreditation_date_issued}` : "";
  const posMin = params.posMin ?? settings.pos_min ?? "";
  const posSerial = params.posSerial ?? settings.pos_serial ?? "";
  const terminalId = params.terminalId ?? "";

  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yyyy = now.getFullYear();
  const dateStr = `${mm}/${dd}/${yyyy}`;

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;

  const fmtCents = (cents: number) => (cents / 100).toFixed(2);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Collection Receipt ${receiptNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
      font-family: 'Consolas', 'Courier New', Courier, monospace;
      font-size: 12px;
      font-weight: 530;
      line-height: 1.35;
      color: #000;
      background: #fff;
      overflow-x: hidden;
      -webkit-font-smoothing: none;
      text-rendering: crispEdges;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 0; background: #fff; }
    .receipt {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      padding: 0 1mm 15mm 1mm;
      box-sizing: border-box;
      background: #fff;
    }
    .center { text-align: center; margin: 2px 0; word-break: break-word; }
    .row { display: flex; justify-content: space-between; align-items: baseline; margin: 2.5px 0; word-break: break-word; }
    .row span:first-child { flex: 1 1 auto; padding-right: 4px; min-width: 0; }
    .row span:last-child { flex: 0 0 auto; white-space: nowrap; text-align: right; padding-right: 0; max-width: 60%; }
    .section { margin: 2.5px 0; word-break: break-word; }
    .bold { font-weight: bold; }
    .store-name { text-align: center; margin: 2px 0 3px 0; font-size: 15px; font-weight: bold; letter-spacing: 0.5px; word-break: break-word; }
    .header-info { font-size: 11.5px; font-weight: 530; line-height: 1.35; text-align: center; margin-bottom: 4px; }
    .divider { border-top: 1.5px dashed #000; margin: 9px 0 10px 0; }
    @media print {
      html, body { width: 80mm; margin: 0; padding: 0; }
      .receipt { width: 76mm; max-width: 76mm; margin: 0 auto; padding: 0 1mm 15mm 1mm; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="store-name">${storeName}</div>
    <div class="header-info">
      ${proprietor ? `<div class="center">Proprietor: ${proprietor}</div>` : ''}
      ${registeredTaxpayerName && registeredTaxpayerName !== proprietor ? `<div class="center">${registeredTaxpayerName}</div>` : ''}
      ${storeAddress ? `<div class="center">${storeAddress}</div>` : ''}
      <div class="center">${settings.vat_enabled ? 'VAT REG TIN' : 'NON-VAT REG TIN'}: ${storeTIN || "[TIN NOT CONFIGURED]"}</div>
      ${(posMin || posSerial) ? `<div class="center">${posMin ? `MIN: ${posMin}` : ''}${posMin && posSerial ? ' | ' : ''}${posSerial ? `S/N: ${posSerial}` : ''}</div>` : ''}
      ${ptuNo ? `<div class="center">PTU No: ${ptuNo}${ptuDate}</div>` : ''}
      ${(storeFb || storePhone) ? `<div class="center">${storeFb ? `Fb: ${storeFb}` : ''}${storeFb && storePhone ? ' | ' : ''}${storePhone ? `Tel No: ${storePhone}` : ''}</div>` : ''}
    </div>
    
    <div class="center bold" style="margin: 8px 0 6px 0; font-size: 15px; letter-spacing: 0.5px;">COLLECTION RECEIPT</div>
    
    <div class="row"><span>CR No: ${receiptNumber}</span></div>
    <div class="row"><span style="white-space:nowrap;">Date:  ${dateStr}</span><span style="white-space:nowrap; padding-right: 2px;">Time: ${timeStr}</span></div>
    <div class="divider"></div>
    <div class="row"><span style="width: 100px; flex-shrink: 0;">RECEIVED FROM:</span><span style="flex: 1; text-align: left;">${(customerName || "").toUpperCase()}</span></div>
    ${customerCode ? `<div class="row"><span style="width: 100px; flex-shrink: 0;">CUST CODE:</span><span style="flex: 1; text-align: left;">${customerCode.toUpperCase()}</span></div>` : ''}
    ${notes ? `<div class="row"><span style="width: 100px; flex-shrink: 0;">REMARKS:</span><span style="flex: 1; text-align: left;">${notes.toUpperCase()}</span></div>` : ''}
    <div class="divider"></div>
    <div class="row"><span>AMOUNT PAID:</span><span>${fmtCents(amountPaidCents)}</span></div>
    <div class="row"><span>REMAINING UTANG BALANCE:</span><span>${fmtCents(newBalanceCents)}</span></div>
    <div class="divider"></div>
    <div class="section">CASHIER: ${(cashierName || "").toUpperCase()}</div>
    <div class="divider"></div>
    <div class="center" style="font-size: 11px;">POS Software: ISRA POS System v1.0</div>
    ${hasAccreditation ? `<div class="center" style="font-size: 11px;">Accreditation No: ${accNo}${accDate}</div>` : ''}
    <div class="divider"></div>
    <div class="center">Thank you for your payment!</div>
    <div class="center">We sincerely appreciate your trust</div>
    <div class="center">and look forward to serving you again!</div>
    <div style="height: 15mm; line-height: 15mm;">&nbsp;</div>
  </div>
</body>
</html>`;
}

export async function printSaleReceipt(params: SaleReceiptParams): Promise<void> {
  const html = buildReceiptHTML(params);
  const bytes = buildSaleReceiptEscpos(params);
  const text = buildSaleReceiptText(params);
  const isCash = params.paymentType === "CASH" || !params.paymentType;

  // 1. Try Local Print Agent (100% Zero-Flash, Exact HTML Raster Image)
  try {
    // ALWAYS rasterize HTML offscreen so imageBase64 is guaranteed for the agent
    let imageBase64: string | undefined;
    try {
      console.log("[Receipt] Starting offscreen HTML rasterization...");
      const raster = await rasterizeReceiptHtml(html);
      imageBase64 = raster?.imageBase64;
      console.log(
        imageBase64
          ? `%c[Receipt] ✅ Rasterization SUCCESS: ${raster!.width}x${raster!.height}px, base64 length=${imageBase64.length}`
          : "%c[Receipt] ❌ Rasterization returned null/undefined — agent will fallback to text",
        imageBase64 ? "color:#10b981;font-weight:bold" : "color:#ef4444;font-weight:bold"
      );
    } catch (rasterErr) {
      console.error("[Receipt] ❌ Offscreen rasterization exception:", rasterErr);
    }

    const success = await localPrintAgent.printRaw(bytes, undefined, text, imageBase64, isCash);
    if (success) return;
  } catch (err) {
    console.warn("[LocalPrintAgent] Print failed:", err);
  }

  // 2. Try Web Serial (Direct USB if connected)
  if (webSerialPrinter.isConnected()) {
    try {
      webSerialPrinter.printRaw(bytes);
      return;
    } catch (err) {
      console.error("[WebSerial] Direct print failed:", err);
    }
  }

  // 3. Fallback: Browser silent print
  printHtmlSilently(html);
}

export async function printCreditPaymentReceipt(params: CreditPaymentReceiptParams): Promise<void> {
  const html = buildCreditPaymentReceiptHTML(params);
  const bytes = buildCreditPaymentReceiptEscpos(params);
  const text = buildCreditPaymentReceiptText(params);

  // 1. Try Local Print Agent (100% Zero-Flash, Exact HTML Raster Image)
  try {
    let imageBase64: string | undefined;
    try {
      const raster = await rasterizeReceiptHtml(html);
      imageBase64 = raster?.imageBase64;
    } catch (rasterErr) {
      console.warn("[Receipt] Offscreen rasterization warning:", rasterErr);
    }

    const success = await localPrintAgent.printRaw(bytes, undefined, text, imageBase64, true);
    if (success) return;
  } catch (err) {
    console.warn("[LocalPrintAgent] Credit print failed:", err);
  }

  // 2. Try Web Serial (Direct USB if connected)
  if (webSerialPrinter.isConnected()) {
    try {
      webSerialPrinter.printRaw(bytes);
      return;
    } catch (err) {
      console.error("[WebSerial] Direct credit print failed:", err);
    }
  }

  // 3. Fallback: Browser silent print
  printHtmlSilently(html);
}

