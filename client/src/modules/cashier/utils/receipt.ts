import type { TaxType } from "@/shared/api/productsApi";
import type { SaleItemSnapshot } from "@/shared/api/salesApi";
import type { StoreSettings } from "@/shared/api/settingsApi";
import { fmtCents, toCentavos } from "./money";

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

const W = 48;
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
    discountCents = 0, discountName, discountPercentage, finalTotalCents = totalCents,
  } = params;

  // grossCents = pre-discount items total
  // totalCents from the server is already the net (post-discount) amount.
  // Derive the gross so the receipt shows it correctly above the discount line.
  const grossCents = discountCents > 0 ? finalTotalCents + discountCents : totalCents;

  const storeName              = settings.store_name              || "";
  const storeFb                = settings.facebook                || "";
  const storePhone             = settings.contact_number          || "";
  const storeAddress           = settings.address                || "";
  const registeredTaxpayerName = settings.registered_taxpayer_name || "";
  const storeTIN               = settings.tin || settings.business_license || "";
  const documentType           = settings.document_type           || "SALES INVOICE";
  const taxRate                = Number(settings.vat_rate) > 0 ? Number(settings.vat_rate) : 12;
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
  if (settings.vat_enabled) ln(center("VAT REGISTERED"));
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
  ln("QTY UNIT DESCRIPTION       PRICE       AMT");
  ln(rule("-"));

  for (const item of cartItems) {
    const qty  = String(item.quantity).padStart(3);
    const unit = (item.unit || "").padEnd(4);
    const up   = `${currSym} ${fmtCents(toCentavos(item.unitPrice))}`.padStart(12);
    const amt  = `${currSym} ${fmtCents(toCentavos(item.subtotal))}`.padStart(12);
    
    // Wrap description if it exceeds 15 characters
    const descWidth = 15;
    const desc = item.name;
    if (desc.length <= descWidth) {
      ln(`${qty} ${unit} ${desc.padEnd(descWidth)} ${up} ${amt}`);
    } else {
      // First line with first part of description
      const firstPart = desc.slice(0, descWidth);
      ln(`${qty} ${unit} ${firstPart.padEnd(descWidth)} ${up} ${amt}`);
      // Wrapped lines starting at DESCRIPTION column (7 spaces for QTY+UNIT)
      const remaining = desc.slice(descWidth);
      for (let i = 0; i < remaining.length; i += descWidth) {
        const wrappedPart = remaining.slice(i, i + descWidth);
        ln(`       ${wrappedPart}`);
      }
    }
  }

  ln(rule("-"));
  ln(lr(`ITEMS: ${totalItems}`, `TOTAL:         ${currSym} ${fmtCents(grossCents)}`));
  ln(rule("-"));
  
  // Discount section
  if (discountCents > 0) {
    ln();
    ln(lr(`DISCOUNT: ${discountName || "N/A"} (${discountPercentage}%)`, `- ${currSym} ${fmtCents(discountCents)}`));
    ln(rule("-"));
    ln(lr(`GROSS TOTAL:`, `${currSym} ${fmtCents(grossCents)}`));
    ln(lr(`NET TOTAL:`, `${currSym} ${fmtCents(finalTotalCents)}`));
    ln(rule("-"));
  }
  
  ln();
  ln(center("VAT BREAKDOWN"));
  ln();

  const bline = (label: string, cents: number) => {
    const val = `${currSym} ${fmtCents(cents)}`;
    const gap = W - label.length - val.length;
    ln(label + (gap > 0 ? " ".repeat(gap) : " ") + val);
  };

  if (settings.vat_enabled) {
    const snaps = params.itemSnapshots;
    // When a discount is applied, scale VAT amounts proportionally to the net total
    const discountRatio = grossCents > 0 && discountCents > 0
      ? finalTotalCents / grossCents
      : 1;
    const vatableNetCents = Math.round(snaps.filter((s) => s.tax_type === "VATABLE").reduce((acc, s) => acc + toCentavos(s.taxable_amount), 0) * discountRatio);
    const vatExemptCents  = Math.round(snaps.filter((s) => s.tax_type === "VAT_EXEMPT").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0) * discountRatio);
    const zeroRatedCents  = Math.round(snaps.filter((s) => s.tax_type === "ZERO_RATED").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0) * discountRatio);
    const nonTaxableCents = Math.round(snaps.filter((s) => s.tax_type === "NON_TAXABLE").reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0) * discountRatio);
    const scaledTaxCents  = Math.round(taxCents * discountRatio);
    bline(`VATable Sales (Net of VAT):`,  vatableNetCents);
    bline(`VAT Amount (${taxRate}%):`,    scaledTaxCents);
    bline("VAT-Exempt Sales:",            vatExemptCents);
    bline("Zero-Rated Sales:",            zeroRatedCents);
    bline("Non-Taxable Sales:",           nonTaxableCents);
  } else {
    bline("Non-VAT Sales:",   finalTotalCents);
    bline("Total VAT Amount:", 0);
  }

  ln(rule("-"));
  bline("TOTAL AMOUNT DUE:", finalTotalCents);
  ln();
  bline("Cash Tendered:", cashCents);
  bline("Change:",         changeCents ?? 0);
  ln(rule("-"));
  ln();
  ln(`CASHIER: ${cashierName}`);
  ln(rule("-"));
  ln();
  ln(center("Thank you for your business."));
  ln(center("We sincerely appreciate your trust"));
  ln(center("and look forward to serving you again."));
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
  @page { size: 58mm auto; margin: 0; }
  html { width: 58mm; }
  body { 
    width: 48mm; 
    margin: 0 auto; 
    font-family:'Courier New',Courier,monospace;
    font-size: 9px;
    line-height: 1.2;
    white-space: pre;
    color: #000;
    padding: 0;
  }
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
