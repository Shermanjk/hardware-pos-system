import { toCentavos, fmtCents } from "./money";
import type { TaxType } from "@/shared/api/productsApi";
import type { SaleItemSnapshot } from "@/shared/api/salesApi";
import type { StoreSettings } from "@/shared/api/settingsApi";

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
}

const W = 72;
const center = (s: string, w = W) => s.padStart(Math.floor((w + s.length) / 2)).padEnd(w);
const rule = (ch = "=") => ch.repeat(W);
const lr = (left: string, right: string, w = W) => {
  const gap = w - left.length - right.length;
  return left + (gap > 0 ? " ".repeat(gap) : " ") + right;
};

function buildReceiptText(params: SaleReceiptParams): string {
  const {
    invoiceNumber, cartItems, customerInfo,
    subtotalCents, taxCents, totalCents,
    cashCents, changeCents, cashierName, settings,
  } = params;

  const storeName              = settings.store_name              || "";
  const storeFb                = settings.store_fb                || "";
  const storePhone             = settings.store_phone             || "";
  const storeAddress           = settings.store_address           || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const storeTIN               = settings.tin || settings.business_license || "";
  const documentType           = settings.document_type           || "SALES INVOICE";
  const taxRate                = Number(settings.tax_rate) > 0 ? Number(settings.tax_rate) : 12;
  const currSym                = settings.currency === "PHP" ? "P" : settings.currency;

  const now      = new Date();
  const dateStr  = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr  = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);
  const posMin    = settings.pos_min    || "";
  const posSerial = settings.pos_serial || "";

  const lines: string[] = [];
  const ln = (s = "") => lines.push(s);

  ln(rule("="));
  if (registeredTaxpayerName) ln(center(registeredTaxpayerName));
  ln(center(storeName));
  ln(center(storeAddress));
  ln(center(`TIN: ${storeTIN || "[TIN NOT CONFIGURED]"}`));
  if (settings.vat_registered) ln(center("VAT REGISTERED"));
  if (posMin || posSerial) ln(center(`MIN: ${posMin}   |   S/N: ${posSerial}`));
  ln(center(`Fb: ${storeFb}   |   Tel No: ${storePhone}`));
  ln(rule("="));
  ln();
  ln(center(documentType));
  ln(`Invoice No: ${invoiceNumber}`);
  ln(`Date: ${dateStr}${" ".repeat(Math.max(1, W - `Date: ${dateStr}`.length - `Time: ${timeStr}`.length))}Time: ${timeStr}`);
  ln(rule("-"));
  ln(`SOLD TO: ${customerInfo.name}`);
  ln(`TIN: ${customerInfo.tin || "N/A"}`);
  ln(`ADDRESS: ${customerInfo.address || "N/A"}`);
  ln(`BUSINESS STYLE: ${customerInfo.businessStyle || "N/A"}`);
  ln(rule("-"));
  ln("QTY  UNIT  DESCRIPTION            UNIT PRICE            AMOUNT");
  ln(rule("-"));

  for (const item of cartItems) {
    const qty  = String(item.quantity).padStart(3);
    const unit = (item.unit || "").padEnd(5);
    const desc = item.name.length > 21 ? item.name.slice(0, 20) + "…" : item.name.padEnd(21);
    const up   = `${currSym} ${fmtCents(toCentavos(item.unitPrice))}`.padStart(16);
    const amt  = `${currSym} ${fmtCents(toCentavos(item.subtotal))}`.padStart(16);
    ln(`${qty}  ${unit} ${desc} ${up} ${amt}`);
  }

  ln(rule("-"));
  ln(lr(`ITEMS: ${totalItems}`, `TOTAL:         ${currSym} ${fmtCents(totalCents)}`));
  ln(rule("-"));
  ln();
  ln(center("VAT BREAKDOWN"));
  ln();

  const bline = (label: string, cents: number) => {
    const val = `${currSym} ${fmtCents(cents)}`;
    const gap = W - label.length - val.length;
    ln(label + (gap > 0 ? " ".repeat(gap) : " ") + val);
  };

  if (settings.vat_registered) {
    const snaps = params.itemSnapshots;
    const vatableNetCents = snaps.filter((s) => s.tax_type === "VATABLE").reduce((acc, s) => acc + toCentavos(s.taxable_amount), 0);
    const vatExemptCents  = snaps.filter((s) => s.tax_type === "VAT_EXEMPT").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0);
    const zeroRatedCents  = snaps.filter((s) => s.tax_type === "ZERO_RATED").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0);
    const nonTaxableCents = snaps.filter((s) => s.tax_type === "NON_TAXABLE").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0);
    bline(`VATable Sales (Net of VAT):`,  vatableNetCents);
    bline(`VAT Amount (${taxRate}%):`,    taxCents);
    bline("VAT-Exempt Sales:",            vatExemptCents);
    bline("Zero-Rated Sales:",            zeroRatedCents);
    bline("Non-Taxable Sales:",           nonTaxableCents);
  } else {
    bline("Non-VAT Sales:",   totalCents);
    bline("Total VAT Amount:", 0);
  }

  ln(rule("-"));
  bline("TOTAL AMOUNT DUE:", totalCents);
  ln();
  bline("Cash Tendered:", cashCents);
  bline("Change:",         changeCents ?? 0);
  ln(rule("-"));
  ln();
  ln(`CASHIER: ${cashierName}`);
  ln(rule("-"));
  ln();
  ln(center("Thank you for your business!"));
  ln();
  ln(center(`This is your ${documentType}.`));
  ln(center('"This document is not valid for claiming input taxes."'));
  ln(rule("="));

  return lines.join("\n");
}

export function printSaleReceipt(params: SaleReceiptParams): void {
  const text = buildReceiptText(params);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Receipt</title>
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
