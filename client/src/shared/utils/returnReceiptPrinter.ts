import type { StoreSettings } from "@/shared/api/settingsApi";
import { buildReturnReceiptEscpos } from "@/shared/services/escpos/escposBuilder";
import { localPrintAgent } from "@/shared/services/escpos/localPrintAgent";
import { webSerialPrinter } from "@/shared/services/escpos/webSerialPrinter";
import { printHtmlSilently } from "@/shared/utils/silentHtmlPrinter";
import { rasterizeReceiptHtml } from "@/shared/utils/receiptHtmlRasterizer";

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
  terminalId?: string;
  posMin?: string;
  posSerial?: string;
}

export function buildReturnReceiptText(data: ReturnReceiptData): string {
  const storeName              = data.settings?.store_name              || "ISRA HARDWARE POS";
  const registeredTaxpayerName = data.settings?.registered_taxpayer_name || "";
  const storeAddress           = data.settings?.address                || "";
  const cleanTin = (data.settings?.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : cleanTin;
  const rawBranch = String(data.settings?.branch_code || "").replace(/[^0-9]/g, "");
  const storeTIN = (rawBranch && rawBranch.trim() !== "")
    ? `${tinFormatted}-${rawBranch.padStart(Math.max(3, Math.min(rawBranch.length, 5)), "0")}`
    : tinFormatted;

  const posMin = data.posMin ?? data.settings?.pos_min ?? "";
  const posSerial = data.posSerial ?? data.settings?.pos_serial ?? "";
  const ptuNo = data.settings?.ptu_or_accn_no || "";
  const ptuDate = data.settings?.ptu_date_issued ? ` Date: ${data.settings.ptu_date_issued}` : "";

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH");
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  const fmt = (val: number) => val.toFixed(2);

  const lines: string[] = [];
  lines.push("----------------------------------------");
  lines.push(`          ${storeName.toUpperCase()}`);
  if (registeredTaxpayerName) lines.push(`Prop: ${registeredTaxpayerName}`);
  if (storeAddress) lines.push(storeAddress);
  lines.push(`${data.settings?.vat_enabled ? 'VAT REGISTERED' : 'NON-VAT REGISTERED'} | TIN: ${storeTIN}`);
  if (posMin || posSerial) lines.push(`MIN: ${posMin} | S/N: ${posSerial}`);
  if (ptuNo) lines.push(`PTU / ACCN: ${ptuNo}${ptuDate}`);
  lines.push("----------------------------------------");
  lines.push("        SALES RETURN RECEIPT");
  lines.push("----------------------------------------");
  lines.push(`Return No: ${data.return_number}`);
  lines.push(`Original Invoice: ${(data.invoice_number || "").replace(/^INV-?/i, "").trim()}`);
  lines.push(`Date: ${dateStr} ${timeStr}`);
  if (data.terminalId) lines.push(`Terminal: ${data.terminalId.toUpperCase()}`);
  lines.push(`Processed By: ${(data.processed_by_name || "").toUpperCase()}`);
  lines.push(`Customer: ${(data.customer_name || "Walk-in Customer").toUpperCase()}`);
  lines.push("----------------------------------------");
  lines.push("QTY  ITEM DESCRIPTION         PRICE    TOTAL");
  lines.push("----------------------------------------");

  for (const item of data.items) {
    const qty = item.quantity_returned || 1;
    const qtyStr = qty.toString().padEnd(4);
    const nameStr = item.product_name.slice(0, 18).padEnd(18);
    const priceStr = fmt(item.unit_price).padStart(7);
    const totalStr = fmt(item.unit_price * qty).padStart(8);
    lines.push(`${qtyStr} ${nameStr} ${priceStr} ${totalStr}`);
  }

  lines.push("----------------------------------------");
  lines.push("       Thank you for your business.");
  lines.push("   We sincerely appreciate your trust");
  lines.push("  and look forward to serving you again!");
  lines.push("       SALES RETURN RECEIPT");
  lines.push("\n\n\n\n\n");

  return lines.join("\n");
}

export function buildReturnReceiptHTML(data: ReturnReceiptData): string {
  const settings = data.settings;
  const storeName              = settings.store_name              || "ISRA HARDWARE TRADING";
  const proprietor             = settings.proprietor             || "";
  const storeFb                = settings.facebook                || "";
  const storePhone             = settings.contact_number          || "";
  const storeAddress           = settings.address                || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const cleanTin = (settings.tin || "000000000").replace(/[^0-9]/g, "");
  const tinFormatted = cleanTin.length === 9
    ? `${cleanTin.slice(0, 3)}-${cleanTin.slice(3, 6)}-${cleanTin.slice(6, 9)}`
    : (settings.tin || "000-000-000");
  const rawBranch = String(settings.branch_code || "").replace(/[^0-9]/g, "");
  const storeTIN = (rawBranch && rawBranch.trim() !== "") ? `${tinFormatted}-${rawBranch.padStart(Math.max(3, Math.min(rawBranch.length, 5)), "0")}` : tinFormatted;
  const ptuNo = settings.ptu_or_accn_no || "";
  const ptuDate = settings.ptu_date_issued ? ` Date: ${settings.ptu_date_issued}` : "";
  const currSym                = "";
  const posMin                 = data.posMin ?? settings.pos_min ?? "";
  const posSerial              = data.posSerial ?? settings.pos_serial ?? "";
  const terminalId             = data.terminalId ?? "";

  const now = data.resolved_at ? new Date(data.resolved_at) : new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const fmtPeso = (amount: number) => amount.toFixed(2);

  const itemsHTML = data.items.map(item => {
    const qty = item.quantity_returned;
    const unit = "pc";
    const desc = item.product_name;
    const amt = fmtPeso(item.unit_price * item.quantity_returned);
    return `<tr class="item-row">
      <td class="col-qty">${qty}</td>
      <td class="col-unit">${unit}</td>
      <td class="col-desc">${desc}</td>
      <td class="col-amt">${amt}</td>
    </tr>`;
  }).join("");

  const totalItems = data.items.reduce((s, i) => s + i.quantity_returned, 0);

  let resolutionHTML = "";
  if (data.resolution === "refund") {
    const cashRefund = Number(data.cash_refund_amount ?? data.refund_amount ?? 0);
    const creditRefund = Number(data.credit_refund_amount ?? 0);
    const totalReturnVal = cashRefund + creditRefund;

    resolutionHTML = `
    <div class="row"><span>TOTAL RETURN VALUE:</span><span>${fmtPeso(totalReturnVal)}</span></div>
    ${creditRefund > 0 ? `<div class="row"><span>CREDIT DEBT REDUCED:</span><span>${fmtPeso(creditRefund)}</span></div>` : ''}
    <div class="row"><span>CASH REFUNDED:</span><span>${fmtPeso(cashRefund)}</span></div>
    ${data.customer_balance !== undefined && data.customer_balance !== null ? `
    <div class="divider"></div>
    <div class="row"><span>REMAINING UTANG BALANCE:</span><span>${fmtPeso(data.customer_balance)}</span></div>
    ` : ''}`;
  } else if (data.resolution === "exchange") {
    resolutionHTML = `
    ${data.exchange_barcode ? `<div class="section">EXCHANGE BARCODE: ${data.exchange_barcode}</div>` : ''}
    ${data.exchange_quantity ? `<div class="section">EXCHANGE QUANTITY: ${data.exchange_quantity}</div>` : ''}
    ${data.additional_payment && data.additional_payment > 0 ? `<div class="section">ADDITIONAL PAYMENT: ${fmtPeso(data.additional_payment)}</div>` : ''}
    ${data.refund_difference && data.refund_difference > 0 ? `<div class="section">REFUND DIFFERENCE: ${fmtPeso(data.refund_difference)}</div>` : ''}`;
  } else if (data.resolution === "store_credit") {
    resolutionHTML = `
    <div class="section">CREDIT ISSUED: ${fmtPeso(data.refund_amount ?? 0)}</div>
    <div class="section">AVAILABLE BALANCE: ${fmtPeso(data.refund_amount ?? 0)}</div>`;
  } else if (data.resolution === "rejected") {
    resolutionHTML = `<div class="section">RETURN REJECTED</div>`;
  }

  return `<!DOCTYPE html>
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
    
    <div class="center bold" style="margin: 8px 0 6px 0; font-size: 15px; letter-spacing: 0.5px;">SALES RETURN RECEIPT</div>
    
    <div class="row"><span>Return No: ${data.return_number}</span></div>
    <div class="row"><span>Original SI No: ${(data.invoice_number || "").replace(/^INV-?/i, "").trim()}</span></div>
    <div class="row"><span style="white-space:nowrap;">Date: ${dateStr}</span><span style="white-space:nowrap; padding-right: 2px;">Time: ${timeStr}</span></div>
    ${terminalId ? `<div class="row"><span>Terminal: ${terminalId.toUpperCase()}</span></div>` : ''}
    <div class="divider"></div>
    <div class="row"><span style="width: 80px; flex-shrink: 0;">CUSTOMER:</span><span style="flex: 1; text-align: left;">${(data.customer_name || "Walk-In Customer").toUpperCase()}</span></div>
    <div class="section">PROCESSED BY: ${(data.processed_by_name || "").toUpperCase()}</div>
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
    <div class="divider"></div>
    <div class="row"><span>ITEMS: ${totalItems}</span><span>TOTAL REFUND: ${fmtPeso(data.refund_amount ?? 0)}</span></div>
    <div class="divider"></div>
    <div class="center bold">RESOLUTION: ${data.resolution.toUpperCase()}</div>
    <div class="divider"></div>
    ${resolutionHTML}
    <div class="divider"></div>
    <div class="section">ITEM CONDITION: ${data.item_condition === "good" ? "Good" : data.item_condition === "damaged" ? "Damaged" : "Defective"}</div>
    <div class="section">INVENTORY ACTION: ${data.item_condition === "good" ? "Returned to Stock" : "Marked as Damaged/Defective"}</div>
    <div class="divider"></div>
    <div class="center">Thank you for your business.</div>
    <div class="center">We sincerely appreciate your trust</div>
    <div class="center">and look forward to serving you again!</div>
    <div style="margin-top: 3px;"></div>
    <div class="center" style="font-size: 11px;">This is your SALES RETURN RECEIPT.</div>
    <div style="height: 15mm; line-height: 15mm;">&nbsp;</div>
  </div>
</body>
</html>`;
}

export async function printReturnReceipt(data: ReturnReceiptData): Promise<void> {
  const html = buildReturnReceiptHTML(data);
  const bytes = buildReturnReceiptEscpos(data);
  const text = buildReturnReceiptText(data);

  // 1. Try Local Print Agent (100% Zero-Flash, Exact HTML Raster Image)
  try {
    let imageBase64: string | undefined;
    if (localPrintAgent.isAvailable()) {
      const raster = await rasterizeReceiptHtml(html);
      imageBase64 = raster?.imageBase64;
    }

    const success = await localPrintAgent.printRaw(bytes, undefined, text, imageBase64, false);
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

  // 3. Fallback: Browser silent print
  printHtmlSilently(html);
}

