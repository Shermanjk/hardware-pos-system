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
  store_name?: string;
  facebook?: string;
  contact_number?: string;
  address?: string;
  store_tin?: string;
  vat_enabled?: boolean;
  currency?: string;
  exchange_barcode?: string;
  exchange_quantity?: number;
  additional_payment?: number;
  refund_difference?: number;
}

export function printReturnReceipt(data: ReturnReceiptData): void {
  const W = 72;
  const center = (s: string, w = W) => s.padStart(Math.floor((w + s.length) / 2)).padEnd(w);
  const rule = (ch = "=") => ch.repeat(W);
  const lr = (left: string, right: string, w = W) => {
    const gap = w - left.length - right.length;
    return left + (gap > 0 ? " ".repeat(gap) : " ") + right;
  };

  const storeName    = data.store_name    || "";
  const storeFb      = data.facebook      || "";
  const storePhone   = data.contact_number || "";
  const storeAddress = data.address      || "";
  const storeTIN     = data.store_tin     || "";
  const isVAT        = data.vat_enabled ?? false;
  const currSym      = data.currency === "PHP" || !data.currency ? "P" : data.currency;

  const now = data.resolved_at ? new Date(data.resolved_at) : new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const fmtPeso = (amount: number) =>
    amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lines: string[] = [];
  const ln = (s = "") => lines.push(s);

  // Header - same as sales receipt
  ln(rule("="));
  ln(center(storeName));
  ln(center(storeAddress));
  ln(center(`TIN: ${storeTIN || "[TIN NOT CONFIGURED]"}`));
  if (isVAT) ln(center("VAT REGISTERED"));
  ln(center(`Fb: ${storeFb}   |   Tel No: ${storePhone}`));
  ln(rule("="));
  ln();
  ln(center("SALES RETURN RECEIPT"));
  ln(`Return No: ${data.return_number}`);
  ln(`Original Invoice: ${data.invoice_number}`);
  ln(`Date: ${dateStr}${" ".repeat(Math.max(1, W - `Date: ${dateStr}`.length - `Time: ${timeStr}`.length))}Time: ${timeStr}`);
  ln(rule("-"));
  ln(`PROCESSED BY: ${data.processed_by_name}`);
  ln(rule("-"));
  ln(`CUSTOMER: ${data.customer_name}`);
  ln(rule("-"));
  ln("QTY  UNIT  DESCRIPTION            UNIT PRICE            AMOUNT");
  ln(rule("-"));

  // Items table - same layout as sales receipt
  for (const item of data.items) {
    const qty  = String(item.quantity_returned).padStart(3);
    const unit = "".padEnd(5); // No unit for returns
    const desc = item.product_name.length > 21 ? item.product_name.slice(0, 20) + "…" : item.product_name.padEnd(21);
    const up   = `${currSym} ${fmtPeso(item.unit_price)}`.padStart(16);
    const amt  = `${currSym} ${fmtPeso(item.unit_price * item.quantity_returned)}`.padStart(16);
    ln(`${qty}  ${unit} ${desc} ${up} ${amt}`);
  }

  ln(rule("-"));
  const totalItems = data.items.reduce((s, i) => s + i.quantity_returned, 0);
  ln(lr(`ITEMS: ${totalItems}`, `TOTAL REFUND:  ${currSym} ${fmtPeso(data.refund_amount ?? 0)}`));
  ln(rule("-"));

  // Resolution-specific information
  ln();
  ln(center(`RESOLUTION: ${data.resolution.toUpperCase()}`));
  ln(rule("-"));

  if (data.resolution === "refund") {
    ln(`AMOUNT REFUNDED: ${currSym} ${fmtPeso(data.refund_amount ?? 0)}`);
  } else if (data.resolution === "exchange") {
    if (data.exchange_barcode) {
      ln(`EXCHANGE BARCODE: ${data.exchange_barcode}`);
    }
    if (data.exchange_quantity) {
      ln(`EXCHANGE QUANTITY: ${data.exchange_quantity}`);
    }
    if (data.additional_payment && data.additional_payment > 0) {
      ln(`ADDITIONAL PAYMENT: ${currSym} ${fmtPeso(data.additional_payment)}`);
    }
    if (data.refund_difference && data.refund_difference > 0) {
      ln(`REFUND DIFFERENCE: ${currSym} ${fmtPeso(data.refund_difference)}`);
    }
  } else if (data.resolution === "store_credit") {
    ln(`CREDIT ISSUED: ${currSym} ${fmtPeso(data.refund_amount ?? 0)}`);
    ln(`AVAILABLE BALANCE: ${currSym} ${fmtPeso(data.refund_amount ?? 0)}`);
  } else if (data.resolution === "rejected") {
    ln(`RETURN REJECTED`);
  }

  ln(rule("-"));
  ln();
  ln(`ITEM CONDITION: ${data.item_condition === "good" ? "Good" : data.item_condition === "damaged" ? "Damaged" : "Defective"}`);
  ln(`INVENTORY ACTION: ${data.item_condition === "good" ? "Returned to Stock" : "Marked as Damaged/Defective"}`);
  ln(rule("-"));
  ln();
  ln(`PROCESSED BY: ${data.processed_by_name}`);
  ln(rule("-"));
  ln();
  ln(center("Thank you for your business."));
  ln(center("We sincerely appreciate your trust"));
  ln(center("and look forward to serving you again."));
  ln();
  ln(center("This is your SALES RETURN RECEIPT."));
  ln(center('"This document is not valid for claiming input taxes."'));
  ln(rule("="));

  const text = lines.join("\n");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Return Receipt ${data.return_number}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;font-size:11px;white-space:pre;color:#000;padding:8px;}
  @media print{body{padding:0}}
</style></head><body>${text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</body></html>`;

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
