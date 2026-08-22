import type { TaxType } from "@/shared/api/productsApi";
import type { SaleItemSnapshot } from "@/shared/api/salesApi";
import type { StoreSettings } from "@/shared/api/settingsApi";
import { buildCreditPaymentReceiptEscpos, buildSaleReceiptEscpos } from "@/shared/services/escpos/escposBuilder";
import { localPrintAgent } from "@/shared/services/escpos/localPrintAgent";
import { webSerialPrinter } from "@/shared/services/escpos/webSerialPrinter";
import { printHtmlSilently } from "@/shared/utils/silentHtmlPrinter";
import { rasterizeReceiptHtml } from "@/shared/utils/receiptHtmlRasterizer";
import { toCentavos } from "./money";

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
  // For SC/PWD, the displayed VAT amount is 0 (VAT-exempt). For regular: the customer's VAT.
  const displayTaxCents = isScPwd ? 0 : taxCents;
  const displayChangeCents = changeCents !== null ? changeCents : (cashCents >= finalTotalCents ? cashCents - finalTotalCents : 0);
  const scPwdLabel = scPwdType === "SENIOR_CITIZEN" ? "SENIOR CITIZEN" : scPwdType === "PWD" ? "PWD" : "";

  const storeName              = settings.store_name              || "";
  const proprietor             = settings.proprietor             || "";
  const storeFb                = settings.facebook                || "";
  const storePhone             = settings.contact_number          || "";
  const storeAddress           = settings.address                || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : (settings.tin || "000-000-000");
  const branchCode = (settings.branch_code || "00000").replace(/[^0-9]/g, "");
  const storeTIN = `${tinFormatted}-${branchCode}`;
  const ptuNo = settings.ptu_or_accn_no || "";
  const documentType           = settings.document_type           || "SALES INVOICE";
  const taxRate                = Number(settings.vat_rate) > 0 ? Number(settings.vat_rate) : 12;
  const currSym                = settings.currency === "PHP" ? "P" : settings.currency;
  const posMin                 = settings.pos_min    || "";
  const posSerial              = settings.pos_serial || "";

  const now      = new Date();
  const dateStr  = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr  = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);

  const fmtCents = (cents: number) => {
    if (!Number.isFinite(cents)) {
      throw new Error(`[Receipt Error] fmtCents called with invalid non-finite value: ${cents}`);
    }
    return (cents / 100).toFixed(2);
  };

  const itemsHTML = cartItems.map(item => {
    const qty = item.quantity;
    const unit = item.unit || "";
    const desc = item.name;
    const up = fmtCents(toCentavos(item.unitPrice));
    const amt = fmtCents(toCentavos(item.subtotal));
    return `<tr class="item-name-row">
      <td colspan="5" class="col-name">${desc}</td>
    </tr>
    <tr class="item-detail-row">
      <td class="col-qty">${qty}</td>
      <td class="col-unit">${unit}</td>
      <td class="col-spacer"></td>
      <td class="col-price">${currSym} ${up}</td>
      <td class="col-amt">${currSym} ${amt}</td>
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
  <div class="center bold">TAX BREAKDOWN</div>
  <div class="row"><span>VATable Sales:</span><span>${currSym} ${fmtCents(vatableNetCents)}</span></div>
  <div class="row"><span>12% VAT Amount:</span><span>${currSym} ${fmtCents(vatAmountCents)}</span></div>
  <div class="row"><span>VAT-Exempt Sales:</span><span>${currSym} ${fmtCents(vatExemptCentsCalculated)}</span></div>
  <div class="row"><span>Zero-Rated Sales:</span><span>${currSym} ${fmtCents(zeroRatedCents)}</span></div>
  ${nonTaxableCents > 0 && !settings.vat_enabled ? `<div class="row"><span>Non-VAT Sales:</span><span>${currSym} ${fmtCents(nonTaxableCents)}</span></div>` : ''}`;

  let discountHTML = "";
  if (discountCents > 0) {
    const pctStr = discountPercentage ? ` (${discountPercentage}%)` : "";
    discountHTML = `
    <div class="divider"></div>
    <div class="row"><span>DISCOUNT: ${discountName || "Discount"}${pctStr}:</span><span>- ${currSym} ${fmtCents(discountCents)}</span></div>
    <div class="divider"></div>
    <div class="row"><span>GROSS TOTAL:</span><span>${currSym} ${fmtCents(grossCents)}</span></div>
    <div class="row"><span>VAT-EXEMPT AMOUNT:</span><span>${currSym} ${fmtCents(isScPwd ? vatExemptCents : 0)}</span></div>
    <div class="row"><span>NET TOTAL:</span><span>${currSym} ${fmtCents(finalTotalCents)}</span></div>`;
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
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.4;
      color: #000;
      overflow-x: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 0; }
    .receipt {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      padding: 0;
    }
    .center { text-align: center; margin: 1px 0; word-break: break-word; }
    .row { display: flex; justify-content: space-between; margin: 1px 0; word-break: break-word; }
    .row span:first-child { flex: 1 1 auto; padding-right: 4px; min-width: 0; }
    .row span:last-child { flex: 0 0 auto; white-space: nowrap; text-align: right; max-width: 55%; }
    .section { margin: 1px 0; word-break: break-word; }
    .bold { font-weight: bold; }
    .store-name { text-align: center; margin: 3px 0; font-size: 15px; font-weight: bold; word-break: break-word; }
    .divider { border-top: 1px dashed #000; margin: 3px 0; }
    .items { width: 100%; border-collapse: collapse; margin: 3px 0; table-layout: fixed; }
    .items th, .items td { padding: 0 1px; vertical-align: middle; }
    .items th { font-size: 10px; font-weight: bold; }
    .items .col-hdr-qty   { width: 12%; text-align: center; }
    .items .col-hdr-unit  { width: 14%; text-align: left; }
    .items .col-hdr-space { width: 4%; text-align: left; }
    .items .col-hdr-price { width: 35%; text-align: right; }
    .items .col-hdr-amt   { width: 35%; text-align: right; }
    .item-name-row td.col-name { word-break: break-word; overflow-wrap: anywhere; padding: 2px 1px 0 1px; font-weight: bold; }
    .item-detail-row td { padding: 0 1px 3px 1px; }
    .item-detail-row .col-qty   { width: 12%; text-align: center; }
    .item-detail-row .col-unit  { width: 14%; text-align: left; }
    .item-detail-row .col-spacer { width: 4%; }
    .item-detail-row .col-price { width: 35%; text-align: right; word-break: break-all; }
    .item-detail-row .col-amt   { width: 35%; text-align: right; word-break: break-all; }
    @media print {
      html, body { width: 80mm; margin: 0; padding: 0; }
      .receipt { width: 76mm; max-width: 76mm; margin: 0 auto; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="divider"></div>
    <div class="store-name">${storeName}</div>
    ${registeredTaxpayerName ? `<div class="center">${registeredTaxpayerName}</div>` : ''}
    ${proprietor ? `<div class="center">PROPRIETOR: ${proprietor}</div>` : ''}
    <div class="center">${settings.vat_enabled ? 'VAT REGISTERED' : 'NON-VAT REGISTERED'} | TIN: ${storeTIN || "[TIN NOT CONFIGURED]"}</div>
    ${posMin || posSerial ? `<div class="center">MIN: ${posMin} | S/N: ${posSerial}</div>` : ''}
    ${ptuNo ? `<div class="center">PTU / ACCN: ${ptuNo}</div>` : ''}
    <div class="center">Fb: ${storeFb} | Tel No: ${storePhone}</div>
    <div class="divider"></div>
    <div class="center bold">${documentType}</div>
    <div class="row"><span>Invoice No:</span><span>${invoiceNumber}</span></div>
    <div class="row"><span>Date:</span><span>${dateStr}</span></div>
    <div class="row"><span>Time:</span><span>${timeStr}</span></div>
    <div class="divider"></div>
    <div class="section">SOLD TO: ${customerInfo.name}</div>
    ${scPwdType !== "NONE" ? `<div class="section bold">${scPwdLabel}: ${scPwdId || "N/A"}</div>` : ''}
    <div class="section">TIN: ${customerInfo.tin || "N/A"}</div>
    <div class="section">ADDRESS: ${customerInfo.address || "N/A"}</div>
    <div class="section">BUSINESS STYLE: ${customerInfo.businessStyle || "N/A"}</div>
    <div class="divider"></div>
    <table class="items">
      <thead>
        <tr>
          <th class="col-hdr-qty">QTY</th>
          <th class="col-hdr-unit">UNIT</th>
          <th class="col-hdr-space"></th>
          <th class="col-hdr-price">PRICE</th>
          <th class="col-hdr-amt">AMT</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
    <div class="divider"></div>
    <div class="row"><span>ITEMS: ${totalItems}</span><span class="bold">TOTAL: ${currSym}&nbsp;${fmtCents(grossCents)}</span></div>
    ${discountHTML}
    ${vatBreakdownHTML}
    <div class="divider"></div>
    ${params.paymentType === "CREDIT" ? `
    <div class="row bold"><span>TOTAL AMOUNT:</span><span>${currSym} ${fmtCents(finalTotalCents)}</span></div>
    <div class="row bold"><span>PAYMENT METHOD:</span><span>CREDIT / CHARGE</span></div>
    ${(params.downPaymentCents && params.downPaymentCents > 0) ? `
    <div class="row"><span>Down Payment (Cash):</span><span>${currSym} ${fmtCents(params.downPaymentCents)}</span></div>
    <div class="row bold"><span>Charged to Account:</span><span>${currSym} ${fmtCents(finalTotalCents - params.downPaymentCents)}</span></div>
    ` : `
    <div class="row bold"><span>Charged to Account:</span><span>${currSym} ${fmtCents(finalTotalCents)}</span></div>
    `}
    ${params.creditBalance !== undefined && params.creditBalance !== null ? `
    <div class="row"><span>Total Account Balance:</span><span>${currSym} ${fmtCents(params.creditBalance)}</span></div>
    ` : ''}
    <div class="divider"></div>
    <div class="section" style="margin-top: 14px; margin-bottom: 4px;">
      <div style="border-bottom: 1px solid #000; width: 80%; margin: 12px auto 4px auto;"></div>
      <div class="center" style="font-size: 9px;">CUSTOMER ACKNOWLEDGEMENT / SIGNATURE</div>
    </div>
    ` : `
    <div class="row bold"><span>TOTAL AMOUNT DUE:</span><span>${currSym} ${fmtCents(finalTotalCents)}</span></div>
    <div class="row"><span>Cash Tendered:</span><span>${currSym} ${fmtCents(cashCents)}</span></div>
    <div class="row"><span>Change:</span><span>${currSym} ${fmtCents(displayChangeCents)}</span></div>
    `}
    <div class="divider"></div>
    <div class="section">CASHIER: ${cashierName}</div>
    <div class="divider"></div>
    <div class="center">POS Software: Antigravity POS v2.0</div>
    <div class="center">Accreditation No: 000-000000000-000000</div>
    <div class="divider"></div>
    ${posMin ? `
    <div class="center bold">THIS SERVES AS AN OFFICIAL SALES INVOICE</div>
    <div class="center">Thank you for your business!</div>
    ` : `
    <div class="center bold">*** THIS DOCUMENT IS NOT VALID FOR ***</div>
    <div class="center bold">***      CLAIM OF INPUT TAX        ***</div>
    <div class="center bold">*** THIS IS NOT AN OFFICIAL INVOICE ***</div>
    `}
    <div class="divider"></div>
  </div>
</body>
</html>`;
}



export function buildSaleReceiptText(params: SaleReceiptParams): string {
  const {
    invoiceNumber, cartItems, customerInfo,
    subtotalCents, taxCents, totalCents,
    cashCents, changeCents, cashierName, settings,
    discountCents = 0, discountName, discountPercentage, finalTotalCents = totalCents,
    vatExemptCents = 0, scPwdType = "NONE", scPwdId,
    paymentType = "CASH", creditBalance, downPaymentCents = 0
  } = params;

  const isScPwd = scPwdType !== "NONE";
  const displayChangeCents = changeCents !== null ? changeCents : (cashCents >= finalTotalCents ? cashCents - finalTotalCents : 0);
  const scPwdLabel = scPwdType === "SENIOR_CITIZEN" ? "SENIOR CITIZEN" : scPwdType === "PWD" ? "PWD" : "";

  const storeName              = settings.store_name              || "ISRA HARDWARE POS";
  const storeAddress           = settings.address                || "";
  const storePhone             = settings.contact_number          || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : cleanTin;
  const branchCode = settings.branch_code || "000";
  const ptuNo = settings.ptu_or_accn_no || "";

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH");
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  const fmt = (cents: number) => (cents / 100).toFixed(2);

  const lines: string[] = [];
  lines.push("----------------------------------------");
  lines.push(`          ${storeName.toUpperCase()}`);
  if (registeredTaxpayerName) lines.push(`Prop: ${registeredTaxpayerName}`);
  if (storeAddress) lines.push(storeAddress);
  if (storePhone) lines.push(`Tel: ${storePhone}`);
  lines.push(`TIN: ${tinFormatted}-${branchCode}`);
  if (ptuNo) lines.push(`PTU: ${ptuNo}`);
  lines.push("----------------------------------------");
  lines.push(`OFFICIAL RECEIPT #: ${invoiceNumber}`);
  lines.push(`Date: ${dateStr} ${timeStr}`);
  lines.push(`Cashier: ${cashierName}`);
  if (customerInfo.name) lines.push(`Customer: ${customerInfo.name}`);
  if (customerInfo.tin) lines.push(`Cust TIN: ${customerInfo.tin}`);
  lines.push("----------------------------------------");
  lines.push("QTY  ITEM DESCRIPTION         PRICE    TOTAL");
  lines.push("----------------------------------------");

  for (const item of cartItems) {
    const qtyStr = item.quantity.toString().padEnd(4);
    const nameStr = item.name.slice(0, 18).padEnd(18);
    const priceStr = fmt(toCentavos(item.unitPrice)).padStart(7);
    const totalStr = fmt(toCentavos(item.subtotal)).padStart(8);
    lines.push(`${qtyStr} ${nameStr} ${priceStr} ${totalStr}`);
  }

  lines.push("----------------------------------------");
  lines.push(`SUBTOTAL:                      P${fmt(subtotalCents)}`);

  if (discountCents > 0) {
    const dLabel = discountName || (discountPercentage ? `${discountPercentage}%` : "DISCOUNT");
    lines.push(`DISCOUNT (${dLabel}):        -P${fmt(discountCents)}`);
  }

  lines.push(`TOTAL AMOUNT DUE:              P${fmt(finalTotalCents)}`);
  lines.push("----------------------------------------");

  if (paymentType === "CREDIT") {
    lines.push(`PAYMENT TYPE:                    CHARGE/CREDIT`);
    if (downPaymentCents > 0) lines.push(`DOWN PAYMENT:                  P${fmt(downPaymentCents)}`);
    if (creditBalance !== undefined && creditBalance !== null) {
      lines.push(`OUTSTANDING BALANCE:           P${fmt(creditBalance)}`);
    }
  } else {
    lines.push(`CASH TENDERED:                 P${fmt(cashCents)}`);
    lines.push(`CHANGE:                        P${fmt(displayChangeCents)}`);
  }

  lines.push("----------------------------------------");
  if (isScPwd) {
    lines.push(`CLIENT TYPE: ${scPwdLabel}`);
    if (scPwdId) lines.push(`ID NO: ${scPwdId}`);
    lines.push(`VAT-EXEMPT SALES:              P${fmt(vatExemptCents)}`);
  } else {
    const vatableSales = finalTotalCents - taxCents;
    lines.push(`VATable Sales:                 P${fmt(vatableSales)}`);
    lines.push(`12% VAT Amount:                P${fmt(taxCents)}`);
  }
  lines.push("----------------------------------------");
  lines.push("      THANK YOU FOR YOUR PURCHASE!");
  lines.push("       THIS SERVES AS OFFICIAL RECEIPT");
  lines.push("----------------------------------------\n\n\n");

  return lines.join("\n");
}

export function buildCreditPaymentReceiptText(params: CreditPaymentReceiptParams): string {
  const {
    receiptNumber, customerName, customerCode,
    amountPaidCents, newBalanceCents, cashierName,
    notes, settings,
  } = params;

  const storeName              = settings.store_name              || "ISRA HARDWARE POS";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const storeAddress           = settings.address                || "";
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : cleanTin;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH");
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  const fmt = (cents: number) => (cents / 100).toFixed(2);

  const lines: string[] = [];
  lines.push("----------------------------------------");
  lines.push(`          ${storeName.toUpperCase()}`);
  if (registeredTaxpayerName) lines.push(`Prop: ${registeredTaxpayerName}`);
  if (storeAddress) lines.push(storeAddress);
  lines.push(`TIN: ${tinFormatted}`);
  lines.push("----------------------------------------");
  lines.push("        CREDIT PAYMENT RECEIPT");
  lines.push("----------------------------------------");
  lines.push(`RECEIPT NO: ${receiptNumber}`);
  lines.push(`Date: ${dateStr} ${timeStr}`);
  lines.push(`Cashier: ${cashierName}`);
  lines.push(`Customer: ${customerName}`);
  if (customerCode) lines.push(`Account Code: ${customerCode}`);
  lines.push("----------------------------------------");
  lines.push(`AMOUNT PAID:                  P${fmt(amountPaidCents)}`);
  lines.push(`REMAINING BALANCE:            P${fmt(newBalanceCents)}`);
  lines.push("----------------------------------------");
  if (notes) lines.push(`Notes: ${notes}`);
  lines.push("----------------------------------------");
  lines.push("    THANK YOU FOR YOUR PAYMENT!");
  lines.push("----------------------------------------\n\n\n");

  return lines.join("\n");
}

export function buildCreditPaymentReceiptHTML(params: CreditPaymentReceiptParams): string {
  const {
    receiptNumber, customerName, customerCode,
    amountPaidCents, newBalanceCents, cashierName,
    notes, settings,
  } = params;

  const storeName              = settings.store_name              || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const storeAddress           = settings.address                || "";
  const storeTIN               = settings.tin || settings.business_license || "";
  const currSym                = settings.currency === "PHP" ? "P" : settings.currency;

  const now      = new Date();
  const dateStr  = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr  = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const fmtCents = (cents: number) => (cents / 100).toFixed(2);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Credit Payment Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    html, body {
      width: 80mm;
      margin: 0;
      padding: 0;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.4;
      color: #000;
      overflow-x: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 0; }
    .receipt {
      width: 76mm;
      max-width: 76mm;
      margin: 0 auto;
      padding: 0;
    }
    .center { text-align: center; margin: 1px 0; word-break: break-word; }
    .row { display: flex; justify-content: space-between; margin: 1px 0; word-break: break-word; }
    .row span:first-child { flex: 1 1 auto; padding-right: 4px; min-width: 0; }
    .row span:last-child { flex: 0 0 auto; white-space: nowrap; text-align: right; max-width: 55%; }
    .bold { font-weight: bold; }
    .store-name { text-align: center; margin: 3px 0; font-size: 15px; font-weight: bold; word-break: break-word; }
    .divider { border-top: 1px dashed #000; margin: 3px 0; }
    @media print {
      html, body { width: 80mm; margin: 0; padding: 0; }
      .receipt { width: 76mm; max-width: 76mm; margin: 0 auto; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="divider"></div>
    <div class="store-name">${storeName}</div>
    ${registeredTaxpayerName ? `<div class="center">${registeredTaxpayerName}</div>` : ''}
    <div class="center">${storeAddress}</div>
    <div class="center">TIN: ${storeTIN || "[TIN NOT CONFIGURED]"}</div>
    <div class="divider"></div>
    <div class="center bold">COLLECTION RECEIPT / PAYMENT ACKNOWLEDGEMENT</div>
    <div class="row"><span>Receipt No:</span><span>${receiptNumber}</span></div>
    <div class="row"><span>Date:</span><span>${dateStr}</span></div>
    <div class="row"><span>Time:</span><span>${timeStr}</span></div>
    <div class="divider"></div>
    <div class="row"><span>Received From:</span><span class="bold">${customerName}</span></div>
    ${customerCode ? `<div class="row"><span>Customer Code:</span><span>${customerCode}</span></div>` : ''}
    ${notes ? `<div class="row"><span>Notes:</span><span>${notes}</span></div>` : ''}
    <div class="divider"></div>
    <div class="row bold" style="font-size: 13px;"><span>AMOUNT PAID:</span><span>${currSym} ${fmtCents(amountPaidCents)}</span></div>
    <div class="row bold"><span>REMAINING BALANCE:</span><span>${currSym} ${fmtCents(newBalanceCents)}</span></div>
    <div class="divider"></div>
    <div class="row"><span>Received By:</span><span>${cashierName}</span></div>
    <div class="divider"></div>
    <div class="center" style="margin-top: 10px;">Thank you for your payment!</div>
    <div class="divider"></div>
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
    let imageBase64: string | undefined;
    if (localPrintAgent.isAvailable()) {
      const raster = await rasterizeReceiptHtml(html);
      imageBase64 = raster?.imageBase64;
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
    if (localPrintAgent.isAvailable()) {
      const raster = await rasterizeReceiptHtml(html);
      imageBase64 = raster?.imageBase64;
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

