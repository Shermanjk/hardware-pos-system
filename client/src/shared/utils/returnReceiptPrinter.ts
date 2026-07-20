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
  resolution: "refund" | "replacement";
  item_condition: "good" | "damaged";
  refund_amount: number | null;
  items: ReturnReceiptItem[];
  resolved_at?: string;
  store_name?: string;
  store_fb?: string;
  store_phone?: string;
  store_address?: string;
  store_tin?: string;
  currency?: string;
}

export function printReturnReceipt(data: ReturnReceiptData): void {
  const storeName    = data.store_name    || "ISRA HARDWARE";
  const storeFb      = data.store_fb      || "Rexjie Saludo";
  const storePhone   = data.store_phone   || "09093250717";
  const storeAddress = data.store_address || "Purok Lapu-Lapu, Tikwas 7015 Dumalinao, Zamboanga del Sur";
  const storeTIN     = data.store_tin     || "765-490-574-00000";
  const currSym      = data.currency === "PHP" || !data.currency ? "&#8369;" : data.currency;

  const now = data.resolved_at ? new Date(data.resolved_at) : new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

  const fmtPeso = (amount: number) =>
    amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = data.items
    .map(
      (item) =>
        `<tr>
          <td style="padding:3px 4px;border-bottom:1px solid #eee;">${item.product_name}</td>
          <td style="padding:3px 4px;border-bottom:1px solid #eee;text-align:center;">${item.quantity_returned}</td>
          <td style="padding:3px 4px;border-bottom:1px solid #eee;text-align:right;">${currSym}${fmtPeso(item.unit_price)}</td>
          <td style="padding:3px 4px;border-bottom:1px solid #eee;text-align:right;">${currSym}${fmtPeso(item.unit_price * item.quantity_returned)}</td>
        </tr>`
    )
    .join("");

  const resolutionLabel =
    data.resolution === "refund"
      ? `<div class="r tr" style="font-size:13px;"><span>Total Refund</span><span>${currSym}${fmtPeso(data.refund_amount ?? 0)}</span></div>`
      : `<div style="text-align:center;font-weight:bold;margin:6px 0;font-size:13px;letter-spacing:1px;">REPLACEMENT</div>`;

  const conditionLabel =
    data.item_condition === "good" ? "Good Condition (Returned to Stock)" : "Damaged (Written Off)";

  // Barcode-style visual for return number
  const barcodeDisplay = `<div style="text-align:center;font-family:monospace;letter-spacing:4px;font-size:18px;margin:6px 0;">${data.return_number}</div>`;

  const w = window.open("", "_blank", "width=420,height=760");
  if (!w) return;

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Return Receipt ${data.return_number}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:12px;color:#111;padding:16px;width:340px}
  .c{text-align:center}.b{font-weight:bold}
  hr{border:none;border-top:1px dashed #999;margin:8px 0}
  .r{display:flex;justify-content:space-between;margin:2px 0}
  .lbl{color:#555}
  table{width:100%;border-collapse:collapse;margin:6px 0}
  th{padding:3px 4px;border-bottom:2px solid #333;font-size:11px;text-align:left}
  .tr{font-weight:bold;padding:5px 4px 2px}
  .ft{margin-top:10px;font-size:11px;color:#666;text-align:center}
  .badge{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:2px 8px;font-size:11px;display:inline-block;margin-top:4px;}
  @media print{body{padding:0}}
</style></head><body>
  <div class="c">
  <div class="b" style="font-size:15px">${storeName}</div>
  <div>${storeAddress}</div>
  <div style="font-size:11px;color:#555;margin-top:3px">TIN: ${storeTIN} (VAT-Registered)</div>
  <div style="font-size:11px;color:#555;">Return Receipt</div>
  <div style="font-size:11px;color:#555;">Fb: ${storeFb} | Tel: ${storePhone}</div>
</div>
<hr/>
${barcodeDisplay}
<div class="r"><span class="lbl">Return No.:</span><span class="b">${data.return_number}</span></div>
<div class="r"><span class="lbl">Original Invoice:</span><span class="b">${data.invoice_number}</span></div>
<div class="r"><span class="lbl">Date:</span><span>${dateStr}</span></div>
<div class="r"><span class="lbl">Time:</span><span>${timeStr}</span></div>
<div class="r"><span class="lbl">Processed By:</span><span>${data.processed_by_name}</span></div>
<hr/>
<div class="r"><span class="lbl">Customer:</span><span class="b">${data.customer_name}</span></div>
<hr/>
<table>
  <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amt</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<hr/>
${resolutionLabel}
<div style="margin-top:4px;font-size:11px;color:#555;">
  Item Condition: <span class="badge">${conditionLabel}</span>
</div>
<hr/>
<div class="ft">
  <p>Thank you for your business.</p>
  <p style="margin-top:3px;font-size:10px;">This serves as your official return receipt.</p>
</div>
<script>window.onload=function(){window.print();window.close();}<\/script>
</body></html>`);
  w.document.close();
}
