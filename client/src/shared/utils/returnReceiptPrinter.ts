import type { StoreSettings } from "@/shared/api/settingsApi";
import { buildReturnReceiptEscpos } from "@/shared/services/escpos/escposBuilder";
import { localPrintAgent } from "@/shared/services/escpos/localPrintAgent";
import { webSerialPrinter } from "@/shared/services/escpos/webSerialPrinter";
import { printHtmlSilently } from "@/shared/utils/silentHtmlPrinter";

export interface ReturnReceiptItem {
  product_name: string;
  quantity_returned: number;
  unit_price: number;
}

export interface ReturnReceiptData {
  return_number: string;
  invoice_number: string;
  customer_name: string;
  processed_by_name: string;
  resolution: "refund" | "exchange" | "store_credit" | "rejected";
  item_condition: "good" | "damaged" | "defective";
  refund_amount: number | null;
  credit_refund_amount?: number | null;
  cash_refund_amount?: number | null;
  customer_balance?: number | null;
  items: ReturnReceiptItem[];
  resolved_at?: string;
  settings: StoreSettings;
  exchange_barcode?: string;
  exchange_quantity?: number;
  additional_payment?: number;
  refund_difference?: number;
}

export async function printReturnReceipt(data: ReturnReceiptData): Promise<void> {
  const bytes = buildReturnReceiptEscpos(data);

  // 1. Try Local Print Agent (100% Zero-Flash)
  try {
    const success = await localPrintAgent.printRaw(bytes);
    if (success) return;
  } catch (err) {
    console.warn("[LocalPrintAgent] Return print failed:", err);
  }

  // 2. Try Web Serial (Direct USB if connected)
  if (webSerialPrinter.isConnected()) {
    try {
      webSerialPrinter.printRaw(bytes);
      return;
    } catch (err) {
      console.error("[WebSerial] Direct return print failed, falling back to HTML iframe print:", err);
    }
  }

  const settings = data.settings;
  const storeName              = settings.store_name              || "";
  const proprietor             = settings.proprietor             || "";
  const storeFb                = settings.facebook                || "";
  const storePhone             = settings.contact_number          || "";
  const storeAddress           = settings.address                || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const storeTIN               = settings.tin || settings.business_license || "";
  const documentType           = settings.document_type           || "SALES INVOICE";
  const taxRate                = Number(settings.vat_rate) > 0 ? Number(settings.vat_rate) : 12;
  const isVAT                  = settings.vat_enabled ?? false;
  const currSym                = settings.currency === "PHP" ? "P" : settings.currency;
  const posMin                 = settings.pos_min    || "";
  const posSerial              = settings.pos_serial || "";

  const now = data.resolved_at ? new Date(data.resolved_at) : new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const fmtPeso = (amount: number) => amount.toFixed(2);

  const itemsHTML = data.items.map(item => {
    const qty = item.quantity_returned;
    const unit = "";
    const desc = item.product_name;
    const up = fmtPeso(item.unit_price);
    const amt = fmtPeso(item.unit_price * item.quantity_returned);
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

  const totalItems = data.items.reduce((s, i) => s + i.quantity_returned, 0);

  let resolutionHTML = "";
  if (data.resolution === "refund") {
    const cashRefund = Number(data.cash_refund_amount ?? data.refund_amount ?? 0);
    const creditRefund = Number(data.credit_refund_amount ?? 0);
    const totalReturnVal = cashRefund + creditRefund;

    resolutionHTML = `
    <div class="row"><span>TOTAL RETURN VALUE:</span><span>${currSym} ${fmtPeso(totalReturnVal)}</span></div>
    ${creditRefund > 0 ? `<div class="row"><span>CREDIT DEBT REDUCED:</span><span>${currSym} ${fmtPeso(creditRefund)}</span></div>` : ''}
    <div class="row bold"><span>CASH REFUNDED:</span><span>${currSym} ${fmtPeso(cashRefund)}</span></div>
    ${data.customer_balance !== undefined && data.customer_balance !== null ? `
    <div class="divider"></div>
    <div class="row"><span>REMAINING UTANG BALANCE:</span><span>${currSym} ${fmtPeso(data.customer_balance)}</span></div>
    ` : ''}`;
  } else if (data.resolution === "exchange") {
    resolutionHTML = `
    ${data.exchange_barcode ? `<div class="section">EXCHANGE BARCODE: ${data.exchange_barcode}</div>` : ''}
    ${data.exchange_quantity ? `<div class="section">EXCHANGE QUANTITY: ${data.exchange_quantity}</div>` : ''}
    ${data.additional_payment && data.additional_payment > 0 ? `<div class="section">ADDITIONAL PAYMENT: ${currSym} ${fmtPeso(data.additional_payment)}</div>` : ''}
    ${data.refund_difference && data.refund_difference > 0 ? `<div class="section">REFUND DIFFERENCE: ${currSym} ${fmtPeso(data.refund_difference)}</div>` : ''}`;
  } else if (data.resolution === "store_credit") {
    resolutionHTML = `
    <div class="section">CREDIT ISSUED: ${currSym} ${fmtPeso(data.refund_amount ?? 0)}</div>
    <div class="section">AVAILABLE BALANCE: ${currSym} ${fmtPeso(data.refund_amount ?? 0)}</div>`;
  } else if (data.resolution === "rejected") {
    resolutionHTML = `<div class="section">RETURN REJECTED</div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>Return Receipt ${data.return_number}</title>
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
    <div class="center">${storeAddress}</div>
    <div class="center">${isVAT ? 'VAT REGISTERED | ' : ''}TIN: ${storeTIN || "[TIN NOT CONFIGURED]"}</div>
    ${posMin || posSerial ? `<div class="center">MIN: ${posMin} | S/N: ${posSerial}</div>` : ''}
    <div class="center">Fb: ${storeFb} | Tel No: ${storePhone}</div>
    <div class="divider"></div>
    <div class="center bold">SALES RETURN RECEIPT</div>
    <div class="row"><span>Return No:</span><span>${data.return_number}</span></div>
    <div class="row"><span>Original Invoice:</span><span>${data.invoice_number}</span></div>
    <div class="row"><span>Date:</span><span>${dateStr}</span></div>
    <div class="row"><span>Time:</span><span>${timeStr}</span></div>
    <div class="divider"></div>
    <div class="section">PROCESSED BY: ${data.processed_by_name}</div>
    <div class="divider"></div>
    <div class="section">CUSTOMER: ${data.customer_name}</div>
    <div class="divider"></div>
    <table class="items">
      <thead>
        <tr>
          <th class="col-hdr-qty">QTY</th>
          <th class="col-hdr-unit">UNIT</th>
          <th class="col-hdr-space"></th>
          <th class="col-hdr-price">PRICE</th>
          <th class="col-hdr-amt">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>
    <div class="divider"></div>
    <div class="row"><span>ITEMS: ${totalItems}</span><span>TOTAL REFUND: ${currSym} ${fmtPeso(data.refund_amount ?? 0)}</span></div>
    <div class="divider"></div>
    <div class="center bold">RESOLUTION: ${data.resolution.toUpperCase()}</div>
    <div class="divider"></div>
    ${resolutionHTML}
    <div class="divider"></div>
    <div class="section">ITEM CONDITION: ${data.item_condition === "good" ? "Good" : data.item_condition === "damaged" ? "Damaged" : "Defective"}</div>
    <div class="section">INVENTORY ACTION: ${data.item_condition === "good" ? "Returned to Stock" : "Marked as Damaged/Defective"}</div>
    <div class="divider"></div>
    <div class="section">PROCESSED BY: ${data.processed_by_name}</div>
    <div class="divider"></div>
    <div class="center">Thank you for your business.</div>
    <div class="center">We sincerely appreciate your trust</div>
    <div class="center">and look forward to serving you again.</div>
    <div class="center">This is your SALES RETURN RECEIPT.</div>
    <div class="center">"This document is not valid for claiming input taxes."</div>
    <div class="divider"></div>
  </div>
</body>
</html>`;

  printHtmlSilently(html);
}

