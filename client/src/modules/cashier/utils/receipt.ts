import type { TaxType } from "@/shared/api/productsApi";
import type { SaleItemSnapshot } from "@/shared/api/salesApi";
import type { StoreSettings } from "@/shared/api/settingsApi";
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
}

interface SaleReceiptParams {
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
}

function buildReceiptHTML(params: SaleReceiptParams): string {
  const {
    invoiceNumber, cartItems, customerInfo,
    subtotalCents, taxCents, totalCents,
    cashCents, changeCents, cashierName, settings,
    discountCents = 0, discountName, discountPercentage, finalTotalCents = totalCents,
  } = params;

  const grossCents = discountCents > 0 ? finalTotalCents + discountCents : totalCents;

  const storeName              = settings.store_name              || "";
  const proprietor             = settings.proprietor             || "";
  const storeFb                = settings.facebook                || "";
  const storePhone             = settings.contact_number          || "";
  const storeAddress           = settings.address                || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const storeTIN               = settings.tin || settings.business_license || "";
  const documentType           = settings.document_type           || "SALES INVOICE";
  const taxRate                = Number(settings.vat_rate) > 0 ? Number(settings.vat_rate) : 12;
  const currSym                = settings.currency === "PHP" ? "P" : settings.currency;
  const posMin                 = settings.pos_min    || "";
  const posSerial              = settings.pos_serial || "";

  const now      = new Date();
  const dateStr  = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr  = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);

  const fmtCents = (cents: number) => (cents / 100).toFixed(2);

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

  let vatBreakdownHTML = "";
  if (settings.vat_enabled) {
    const snaps = params.itemSnapshots;
    const discountRatio = grossCents > 0 && discountCents > 0
      ? finalTotalCents / grossCents
      : 1;
    const vatableNetCents = Math.round(snaps.filter((s) => s.tax_type === "VATABLE").reduce((acc, s) => acc + toCentavos(s.taxable_amount), 0) * discountRatio);
    const vatExemptCents  = Math.round(snaps.filter((s) => s.tax_type === "VAT_EXEMPT").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0) * discountRatio);
    const zeroRatedCents  = Math.round(snaps.filter((s) => s.tax_type === "ZERO_RATED").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0) * discountRatio);
    const nonTaxableCents = Math.round(snaps.filter((s) => s.tax_type === "NON_TAXABLE").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0) * discountRatio);
    const scaledTaxCents  = Math.round(taxCents * discountRatio);
    vatBreakdownHTML = `
    <div class="divider"></div>
    <div class="center bold">VAT BREAKDOWN</div>
    <div class="row"><span>VATable Sales (Net of VAT):</span><span>${currSym} ${fmtCents(vatableNetCents)}</span></div>
    <div class="row"><span>VAT Amount (${taxRate}%):</span><span>${currSym} ${fmtCents(scaledTaxCents)}</span></div>
    <div class="row"><span>VAT-Exempt Sales:</span><span>${currSym} ${fmtCents(vatExemptCents)}</span></div>
    <div class="row"><span>Zero-Rated Sales:</span><span>${currSym} ${fmtCents(zeroRatedCents)}</span></div>
    <div class="row"><span>Non-Taxable Sales:</span><span>${currSym} ${fmtCents(nonTaxableCents)}</span></div>`;
  } else {
    vatBreakdownHTML = `
    <div class="divider"></div>
    <div class="center bold">VAT BREAKDOWN</div>
    <div class="row"><span>Non-VAT Sales:</span><span>${currSym} ${fmtCents(finalTotalCents)}</span></div>
    <div class="row"><span>Total VAT Amount:</span><span>${currSym} 0.00</span></div>`;
  }

  let discountHTML = "";
  if (discountCents > 0) {
    discountHTML = `
    <div class="divider"></div>
    <div class="row"><span>DISCOUNT: ${discountName || "N/A"} (${discountPercentage}%):</span><span>- ${currSym} ${fmtCents(discountCents)}</span></div>
    <div class="divider"></div>
    <div class="row"><span>GROSS TOTAL:</span><span>${currSym} ${fmtCents(grossCents)}</span></div>
    <div class="row"><span>NET TOTAL:</span><span>${currSym} ${fmtCents(finalTotalCents)}</span></div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 80mm auto; margin: 4mm 4mm 4mm 4mm; }
    html, body {
      width: 72mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.45;
      color: #000;
    }
    body { padding: 0; overflow-x: hidden; }
    .receipt { width: 72mm; }
    .center { text-align: center; margin: 1px 0; word-break: break-word; }
    .row { display: flex; justify-content: space-between; margin: 1px 0; word-break: break-word; }
    .row span:first-child { flex: 1 1 auto; padding-right: 4px; min-width: 0; }
    .row span:last-child { flex: 0 0 auto; white-space: nowrap; text-align: right; max-width: 55%; }
    .section { margin: 1px 0; word-break: break-word; }
    .bold { font-weight: bold; }
    .store-name { text-align: center; margin: 3px 0; font-size: 15px; font-weight: bold; word-break: break-word; }
    .divider { border-top: 1px dashed #000; margin: 3px 0; }
    .items { width: 100%; border-collapse: collapse; margin: 3px 0; }
    .items th, .items td { padding: 0 2px; vertical-align: middle; }
    .items .col-hdr-qty   { width: 8%; text-align: center; }
    .items .col-hdr-unit  { width: 12%; text-align: left; }
    .items .col-hdr-space { text-align: left; }
    .items .col-hdr-price { width: 27%; text-align: right; }
    .items .col-hdr-amt   { width: 27%; text-align: right; }
    .item-name-row td.col-name { word-break: break-word; overflow-wrap: anywhere; padding: 2px 2px 0 2px; font-weight: bold; }
    .item-detail-row td { padding: 0 2px 3px 2px; }
    .item-detail-row .col-qty   { width: 8%; text-align: center; }
    .item-detail-row .col-unit  { width: 12%; text-align: left; }
    .item-detail-row .col-spacer { }
    .item-detail-row .col-price { width: 27%; text-align: right; word-break: break-all; }
    .item-detail-row .col-amt   { width: 27%; text-align: right; word-break: break-all; }
    @media print { html, body { width: 72mm; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="divider"></div>
    <div class="store-name">${storeName}</div>
    ${registeredTaxpayerName ? `<div class="center">${registeredTaxpayerName}</div>` : ''}
    ${proprietor ? `<div class="center">PROPRIETOR: ${proprietor}</div>` : ''}
    <div class="center">${storeAddress}</div>
    <div class="center">${settings.vat_enabled ? 'VAT REGISTERED | ' : ''}TIN: ${storeTIN || "[TIN NOT CONFIGURED]"}</div>
    ${posMin || posSerial ? `<div class="center">MIN: ${posMin} | S/N: ${posSerial}</div>` : ''}
    <div class="center">Fb: ${storeFb} | Tel No: ${storePhone}</div>
    <div class="divider"></div>
    <div class="center bold">${documentType}</div>
    <div class="row"><span>Invoice No:</span><span>${invoiceNumber}</span></div>
    <div class="row"><span>Date:</span><span>${dateStr}</span></div>
    <div class="row"><span>Time:</span><span>${timeStr}</span></div>
    <div class="divider"></div>
    <div class="section">SOLD TO: ${customerInfo.name}</div>
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
    <div class="row bold"><span>TOTAL AMOUNT DUE:</span><span>${currSym} ${fmtCents(finalTotalCents)}</span></div>
    <div class="row"><span>Cash Tendered:</span><span>${currSym} ${fmtCents(cashCents)}</span></div>
    <div class="row"><span>Change:</span><span>${currSym} ${fmtCents(changeCents ?? 0)}</span></div>
    <div class="divider"></div>
    <div class="section">CASHIER: ${cashierName}</div>
    <div class="divider"></div>
    <div class="center">Thank you for your business.</div>
    <div class="center">We sincerely appreciate your trust</div>
    <div class="center">and look forward to serving you again.</div>
    <div class="center">This is your ${documentType}.</div>
    <div class="center">"Not valid for claiming input taxes."</div>
    <div class="divider"></div>
  </div>
</body>
</html>`;
}

export function printSaleReceipt(params: SaleReceiptParams): void {
  const html = buildReceiptHTML(params);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:80mm;height:0;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) { document.body.removeChild(iframe); return; }
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}
