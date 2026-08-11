import type { StoreSettings } from "@/shared/api/settingsApi";

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
  items: ReturnReceiptItem[];
  resolved_at?: string;
  settings: StoreSettings;
  exchange_barcode?: string;
  exchange_quantity?: number;
  additional_payment?: number;
  refund_difference?: number;
}

export function printReturnReceipt(data: ReturnReceiptData): void {
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
    return `<tr>
      <td class="qty">${qty}</td>
      <td class="unit">${unit}</td>
      <td class="desc">${desc}</td>
      <td class="price">${currSym} ${up}</td>
      <td class="amt">${currSym} ${amt}</td>
    </tr>`;
  }).join("");

  const totalItems = data.items.reduce((s, i) => s + i.quantity_returned, 0);

  let resolutionHTML = "";
  if (data.resolution === "refund") {
    resolutionHTML = `<div class="section">AMOUNT REFUNDED: ${currSym} ${fmtPeso(data.refund_amount ?? 0)}</div>`;
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
    @page { size: 58mm auto; margin: 0; }
    html { width: 58mm; }
    body { 
      width: 48mm; 
      max-width: 48mm;
      margin: 0 auto; 
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      line-height: 1.4;
      color: #000;
      padding: 0;
      overflow-x: hidden;
    }
    .receipt { width: 100%; max-width: 48mm; margin: 0 auto; padding: 0; box-sizing: border-box; }
    .center { text-align: center; margin: 2px 0; overflow-wrap: break-word; word-break: break-word; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; overflow-wrap: break-word; word-break: break-word; }
    .section { margin: 2px 0; overflow-wrap: break-word; word-break: break-word; }
    .items { width: 100%; border-collapse: collapse; margin: 4px 0; table-layout: fixed; }
    .items th, .items td { padding: 2px 0; }
    .items .qty { width: 7mm; text-align: right; }
    .items .unit { width: 9mm; text-align: left; }
    .items .desc { width: 17mm; text-align: left; word-wrap: break-word; max-width: 17mm; overflow-wrap: anywhere; }
    .items .price { width: 7.5mm; text-align: right; }
    .items .amt { width: 7.5mm; text-align: right; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px solid #000; margin: 4px 0; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="divider"></div>
    ${registeredTaxpayerName ? `<div class="center">${registeredTaxpayerName}</div>` : ''}
    ${proprietor ? `<div class="center">${proprietor}</div>` : ''}
    <div class="center bold">${storeName}</div>
    <div class="center">${storeAddress}</div>
    <div class="center">TIN: ${storeTIN || "[TIN NOT CONFIGURED]"}</div>
    ${isVAT ? '<div class="center">VAT REGISTERED</div>' : ''}
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
          <th class="qty">QTY</th>
          <th class="unit">UNIT</th>
          <th class="desc">DESCRIPTION</th>
          <th class="price">PRICE</th>
          <th class="amt">AMT</th>
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

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;";
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
