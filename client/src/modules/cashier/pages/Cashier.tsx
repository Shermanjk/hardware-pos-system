import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Trash2, Plus, Minus, LogOut, Clock, User,
  X, Search, DollarSign, ChevronDown, PauseCircle, PlayCircle, Loader2, RotateCcw, Hourglass,
} from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { createSale, type CreateSalePayload, type SaleItemSnapshot, getSaleByInvoice, type Sale } from "@/shared/api/salesApi";
import { createReturn, getReturnById, resolveReturn, type Return as ReturnFull } from "@/shared/api/returnsApi";
import { searchSales, type SaleSummary } from "@/shared/api/salesApi";
import { lookupProduct, getProduct, type CashierProduct, type TaxType } from "@/shared/api/productsApi";
import { printReturnReceipt } from "@/shared/utils/returnReceiptPrinter";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useReturnDecisions, type ReturnDecisionNotification } from "@/shared/hooks/useReturnNotifications";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax_type: TaxType;
}

interface CustomerInfo {
  name: string;
  address: string;
  tin: string;
  businessStyle: string;
}

interface HeldOrder {
  id: string;
  heldAt: Date;
  cartItems: CartItem[];
  customerInfo: CustomerInfo;
  label: string; // e.g. "Order #1 — Juan dela Cruz"
}

interface HeldReturn {
  id: string;
  heldAt: Date;
  returnId: number;
  returnNumber: string;
  invoiceNumber: string;
  customerName: string;
  decision?: "approved" | "rejected";
  adminName?: string;
}

// ─── Money helpers ────────────────────────────────────────────────────────────

/** Convert a peso float to integer centavos, avoiding float drift. */
const toCentavos = (peso: number) => Math.round(peso * 100);

/** Format integer centavos to a display string like "1,234.56". */
const fmtCents = (centavos: number) =>
  (centavos / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Parse a display string that may contain commas (e.g. "1,000.50")
 * into integer centavos. Returns 0 if blank/invalid.
 */
const parseCashInput = (raw: string): number => {
  const cleaned = raw.replace(/,/g, "");
  const pesos = parseFloat(cleaned);
  return isNaN(pesos) ? 0 : Math.round(pesos * 100);
};

/**
 * Format a raw user input string to show thousand separators while the
 * user is still typing. Preserves a trailing decimal point and up to 2
 * decimal digits so the user can type "1000.5" naturally.
 */
const formatCashDisplay = (raw: string): string => {
  if (!raw) return "";
  // Strip existing commas
  const stripped = raw.replace(/,/g, "");
  const [intPart, decPart] = stripped.split(".");
  const intFormatted = parseInt(intPart || "0", 10).toLocaleString("en-PH");
  if (decPart !== undefined) {
    // User typed a decimal — keep up to 2 digits, preserve trailing dot
    return `${intFormatted}.${decPart.slice(0, 2)}`;
  }
  return intFormatted;
};

// ─── Receipt printer ─────────────────────────────────────────────────────────

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

// ─── Text helpers for monospace receipt layout ───────────────────────────────

const W = 72; // total receipt width in characters

const center = (s: string, w = W) =>
  s.padStart(Math.floor((w + s.length) / 2)).padEnd(w);

const rule = (ch = "=") => ch.repeat(W);

/** Left-align `left`, right-align `right` within `w` chars. */
const lr = (left: string, right: string, w = W) => {
  const gap = w - left.length - right.length;
  return left + (gap > 0 ? " ".repeat(gap) : " ") + right;
};

/** Pad a peso amount string to a fixed width for alignment. */
const peso = (cents: number, w = 10) => {
  const s = `P ${fmtCents(cents)}`;
  return s.padStart(w);
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
  // Use dedicated tin field; fall back to business_license for backward compat
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
  ln(center(`TIN: ${storeTIN || "[TIN NOT CONFIGURED]"}${settings.vat_registered ? " (VAT-Registered)" : ""}`));
  if (posMin || posSerial) {
    ln(center(`MIN: ${posMin}   |   S/N: ${posSerial}`));
  }
  ln(center(`Fb: ${storeFb}   |   Tel No: ${storePhone}`));
  ln(rule("="));
  ln(center(documentType || "[DOCUMENT TYPE NOT CONFIGURED]"));
  ln();
  ln(lr(`SI No: ${invoiceNumber}`, `Date: ${dateStr}`));
  ln(`${"".padEnd(W - timeStr.length)}${timeStr}`);
  ln(rule("-"));
  ln(`SOLD TO: ${customerInfo.name}`);
  ln(`TIN: ${customerInfo.tin || ""}`);
  ln(`ADDRESS: ${customerInfo.address || ""}`);
  ln(`BUSINESS STYLE: ${customerInfo.businessStyle || ""}`);
  ln(rule("-"));

  // Column header
  // QTY(5) UNIT(8) DESCRIPTION(28) UNIT PRICE(14) AMOUNT(12) = 67 + 5 spaces = 72
  ln("QTY   UNIT     DESCRIPTION                   UNIT PRICE         AMOUNT");
  ln(rule("-"));

  for (const item of cartItems) {
    const qty  = String(item.quantity).padEnd(5);
    const unit = (item.unit || "").padEnd(8);
    const desc = item.name.length > 28 ? item.name.slice(0, 27) + "…" : item.name.padEnd(28);
    const up   = `${currSym} ${fmtCents(toCentavos(item.unitPrice))}`.padStart(14);
    const amt  = `${currSym} ${fmtCents(toCentavos(item.subtotal))}`.padStart(12);
    ln(`${qty} ${unit} ${desc} ${up} ${amt}`);
  }

  ln(rule("-"));
  ln(lr(`ITEMS TOTAL: ${totalItems}`, `TOTAL:    ${currSym} ${fmtCents(totalCents)}`));
  ln(rule("-"));
  ln(center("VAT BREAKDOWN:"));

  const bw = 42; // breakdown block width
  const bline = (label: string, cents: number) => {
    const val = `${currSym} ${fmtCents(cents)}`;
    const row = `${label}${val.padStart(bw - label.length)}`;
    ln(" ".repeat(Math.floor((W - bw) / 2)) + row);
  };

  if (settings.vat_registered) {
    // Use backend-authoritative tax snapshots for the VAT breakdown
    const snaps = params.itemSnapshots;
    const vatableNetCents = snaps
      .filter((s) => s.tax_type === "VATABLE")
      .reduce((acc, s) => acc + toCentavos(s.taxable_amount), 0);
    const zeroRatedCents = snaps
      .filter((s) => s.tax_type === "ZERO_RATED")
      .reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0);
    const vatExemptCents = snaps
      .filter((s) => s.tax_type === "VAT_EXEMPT")
      .reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0);
    const nonTaxableCents = snaps
      .filter((s) => s.tax_type === "NON_TAXABLE")
      .reduce((acc, s) => acc + toCentavos(s.line_subtotal), 0);

    bline(`VATable Sales (net of VAT):`, vatableNetCents);
    bline(`Total VAT Amount (${taxRate}%):`,  taxCents);
    bline("Zero-Rated Sales:",                zeroRatedCents);
    bline("VAT-Exempt Sales:",                vatExemptCents);
    if (nonTaxableCents > 0) {
      bline("Non-Taxable Sales:",             nonTaxableCents);
    }
  } else {
    bline("Non-VAT Sales:",   totalCents);
    bline("Total VAT Amount:", 0);
  }
  ln(" ".repeat(Math.floor((W - bw) / 2)) + "-".repeat(bw));
  bline("TOTAL AMOUNT DUE:", totalCents);
  ln();
  ln(lr(`Cash Tendered:`, `${currSym} ${fmtCents(cashCents)}`));
  ln(lr(`Change:`,         `${currSym} ${fmtCents(changeCents ?? 0)}`));
  ln(rule("-"));
  ln(`CASHIER: ${cashierName}`);
  ln(rule("-"));
  ln(center("Thank you for your business!"));
  ln(center("This is your Official Receipt."));
  ln(center('"This document is not valid for claiming input taxes."'));
  ln(rule("="));

  return lines.join("\n");
}

function printSaleReceipt(params: SaleReceiptParams): void {
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

// ─── Clock ────────────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm tabular-nums">{time}</span>;
}

// ─── Verify Product Field (barcode scan OR name search) ─────────────────────

interface VerifyProductFieldProps {
  itemId: number;
  expectedBarcode: string;
  productName: string;
  sel: { scannedBarcode: string; barcodeConfirmed: boolean };
  setSelectedItems: React.Dispatch<React.SetStateAction<Record<number, {
    checked: boolean; quantity: number; reason: string;
    scannedBarcode: string; barcodeConfirmed: boolean;
  }>>>;
}

function VerifyProductField({ itemId, expectedBarcode, productName, sel, setSelectedItems }: VerifyProductFieldProps) {
  const [nameResults, setNameResults] = useState<CashierProduct[]>([]);
  const [showDrop, setShowDrop]       = useState(false);
  const [searching, setSearching]     = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (value: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], scannedBarcode: value, barcodeConfirmed: false },
    }));
    setShowDrop(false);
    setNameResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) return;
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await lookupProduct(value.trim());
        setNameResults(results);
        setShowDrop(results.length > 0);
      } catch { /* silent */ } finally {
        setSearching(false);
      }
    }, 300);
  };

  const confirm = (barcode: string) => {
    if (barcode === expectedBarcode) {
      setSelectedItems((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], scannedBarcode: barcode, barcodeConfirmed: true },
      }));
      setShowDrop(false);
      setNameResults([]);
    } else {
      toast.error(`Barcode mismatch for "${productName}".`);
    }
  };

  const selectFromDropdown = (product: CashierProduct) => {
    setShowDrop(false);
    setNameResults([]);
    confirm(product.barcode);
  };

  return (
    <div ref={wrapperRef}>
      <label className="text-xs font-semibold text-gray-700 mb-0.5 block">Scan Barcode or Search by Name to Verify</label>
      <div className="flex gap-2 relative">
        <div className="relative flex-1">
          {searching
            ? <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 animate-spin" />
            : <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          }
          <Input
            value={sel.scannedBarcode}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(sel.scannedBarcode); } }}
            placeholder="Scan barcode or type product name…"
            className={`h-9 text-sm pl-8 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${
              sel.barcodeConfirmed ? "border-green-500 bg-green-50" : ""
            }`}
          />
          {/* Name search dropdown */}
          {showDrop && nameResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {nameResults.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={() => selectFromDropdown(p)}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-blue-50 text-left text-xs border-b border-gray-50 last:border-0 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.product_name}</p>
                    <p className="font-mono text-gray-400">{p.barcode}</p>
                  </div>
                  {p.barcode === expectedBarcode && (
                    <span className="ml-2 shrink-0 text-green-600 font-bold">✓ Match</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs shrink-0"
          onClick={() => confirm(sel.scannedBarcode)}
          disabled={!sel.scannedBarcode.trim() || sel.barcodeConfirmed}
        >
          Confirm
        </Button>
      </div>
      {sel.barcodeConfirmed && (
        <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
          <span className="font-bold">✓</span> Product verified
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Cashier() {
  const { logout, user } = useAuth();

  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    store_name: "", store_fb: "", store_phone: "", store_address: "",
    currency: "PHP", tax_rate: 0, business_license: "",
    registered_taxpayer_name: "", tin: "", document_type: "SALES INVOICE",
    pos_min: "", pos_serial: "", vat_registered: false,
  });

  useEffect(() => {
    getSettings().then(setStoreSettings).catch(() => {/* use defaults */});
  }, []);

  // ── Cart — starts empty, filled by scanning/searching products ───────────
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // ── Barcode / search state ────────────────────────────────────────────────
  const [barcodeInput,    setBarcodeInput]    = useState("");
  const [searchResults,   setSearchResults]   = useState<CashierProduct[]>([]);
  const [searchLoading,   setSearchLoading]   = useState(false);
  const [showDropdown,    setShowDropdown]     = useState(false);
  const searchTimeout   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeRef      = useRef<HTMLInputElement>(null);
  const [cashTendered,  setCashTendered]  = useState<string>("");
  const [customerInfo,  setCustomerInfo]  = useState<CustomerInfo>({
    name: "", address: "", tin: "", businessStyle: "",
  });
  const [heldOrders,    setHeldOrders]    = useState<HeldOrder[]>([]);
  const [showHolds,     setShowHolds]     = useState(false);
  const [holdCounter,   setHoldCounter]   = useState(0);
  const [isProcessing,  setIsProcessing]  = useState(false);

  // ─── Held Returns (pending admin approval) ───────────────────────────────
  const [heldReturns,     setHeldReturns]     = useState<HeldReturn[]>([]);
  const [showHeldReturns, setShowHeldReturns] = useState(false);

  // Listen for admin approve/reject decisions via WebSocket
  useReturnDecisions((n: ReturnDecisionNotification) => {
    // Update the badge on any matching held return
    setHeldReturns((prev) =>
      prev.map((hr) =>
        hr.returnId === n.id
          ? { ...hr, decision: n.decision, adminName: n.admin_name }
          : hr
      )
    );

    if (n.decision === "approved") {
      toast.success(`Return ${n.return_number} approved by ${n.admin_name}`, {
        description: `Invoice ${n.invoice_number} · ${n.customer_name} — you can now process it.`,
        duration: 8000,
      });
    } else {
      toast.error(`Return ${n.return_number} rejected by ${n.admin_name}`, {
        description: `Invoice ${n.invoice_number} · ${n.customer_name}`,
        duration: 8000,
      });
    }
  });

  // ─── Returns state ────────────────────────────────────────────────────────────
  const [showReturns,          setShowReturns]          = useState(false);
  const [searchMode,           setSearchMode]           = useState<"invoice" | "customer" | "date">("invoice");
  const [returnInvoice,        setReturnInvoice]        = useState("");
  const [customerSearch,       setCustomerSearch]       = useState("");
  const [dateFrom,             setDateFrom]             = useState("");
  const [dateTo,               setDateTo]               = useState("");
  const [saleSearchResults,    setSaleSearchResults]    = useState<SaleSummary[]>([]);
  const [returnSale,           setReturnSale]           = useState<Sale | null>(null);
  const [returnLookupError,    setReturnLookupError]    = useState<string | null>(null);
  const [returnLookupLoading,  setReturnLookupLoading]  = useState(false);

  // Per-item selection state: keyed by sale_item id
  const [selectedItems, setSelectedItems] = useState<Record<number, {
    checked: boolean;
    quantity: number;
    reason: string;
    scannedBarcode: string;
    barcodeConfirmed: boolean;
  }>>({});

  const [returnSubmitError,    setReturnSubmitError]    = useState<string | null>(null);
  const [returnSubmitLoading,  setReturnSubmitLoading]  = useState(false);
  const [submittedReturn,      setSubmittedReturn]      = useState<{ return_number: string; id: number } | null>(null);

  // Resolution dialog state
  const [showResolution,       setShowResolution]       = useState(false);
  const [resolveData,          setResolveData]          = useState<ReturnFull | null>(null);
  const [resolution,           setResolution]           = useState<"refund" | "replacement">("refund");
  const [itemCondition,        setItemCondition]        = useState<"good" | "damaged">("good");
  const [resolveLoading,       setResolveLoading]       = useState(false);
  const [resolveError,         setResolveError]         = useState<string | null>(null);

  // ─── Calculations (integer centavo arithmetic — no float drift) ───────────

  // Sum item subtotals in centavos (prices are VAT-inclusive)
  const totalCents     = cartItems.reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxRate        = storeSettings.tax_rate > 0 ? storeSettings.tax_rate : 12;
  // Only VATABLE items contribute to VAT; all other tax types have 0% VAT
  const vatableCents   = cartItems
    .filter((i) => i.tax_type === "VATABLE")
    .reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxCents       = Math.round(vatableCents * taxRate / (100 + taxRate));
  const subtotalCents  = totalCents - taxCents;

  const cashCents      = parseCashInput(cashTendered);
  const changeCents    = cashCents >= totalCents ? cashCents - totalCents : null;
  const isExactChange  = cashCents === totalCents;

  // Peso floats used only for receipt printing (already rounded to cents)
  const subtotal  = subtotalCents  / 100;
  const taxAmount = taxCents       / 100;
  const total     = totalCents     / 100;
  const cash      = cashCents      / 100;

  // ─── Cart actions ──────────────────────────────────────────────────────────

  const updateQty = (id: number, qty: number) => {
    if (qty <= 0) { removeItem(id); return; }
    setCartItems((prev) =>
      prev.map((item) => item.id === id
        ? { ...item, quantity: qty, subtotal: Math.round(qty * toCentavos(Number(item.unitPrice))) / 100 }
        : item)
    );
  };

  const removeItem = (id: number) =>
    setCartItems((prev) => prev.filter((i) => i.id !== id));

  const clearCart = () => {
    setCartItems([]);
    setCashTendered("");
  };

  // ─── Product lookup ───────────────────────────────────────────────────────

  /** Add a product from the DB to cart (or increment qty if already present) */
  const addProductToCart = useCallback((product: CashierProduct) => {
    if (product.quantity <= 0) {
      toast.error(`${product.product_name} is out of stock.`);
      return;
    }
    setCartItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        if (newQty > product.quantity) {
          toast.error(`Only ${product.quantity} unit(s) of ${product.product_name} available.`);
          return prev;
        }
        return prev.map((i) => i.id === product.id
          ? { ...i, quantity: newQty, subtotal: Math.round(newQty * toCentavos(i.unitPrice)) / 100 }
          : i
        );
      }
      const price = Number(product.selling_price);
      return [...prev, {
        id:        product.id,
        name:      product.product_name,
        unit:      product.unit_abbreviation,
        quantity:  1,
        unitPrice: price,
        subtotal:  price,
        tax_type:  product.tax_type ?? "VATABLE",
      }];
    });
    setBarcodeInput("");
    setShowDropdown(false);
    setSearchResults([]);
    barcodeRef.current?.focus();
  }, []);

  /** Triggered every time barcodeInput changes */
  const handleBarcodeChange = (value: string) => {
    setBarcodeInput(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!value.trim()) {
      setShowDropdown(false);
      setSearchResults([]);
      return;
    }

    // Debounce DB call
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await lookupProduct(value.trim());
        // If exactly one exact barcode match → add directly, no dropdown
        if (results.length === 1 && results[0].barcode === value.trim()) {
          addProductToCart(results[0]);
          setSearchLoading(false);
          return;
        }
        setSearchResults(results);
        setShowDropdown(results.length > 0);
      } catch {
        toast.error("Product lookup failed. Check your connection.");
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  /** Enter key: if one result, add it; otherwise try exact barcode match */
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (searchResults.length === 1) {
      addProductToCart(searchResults[0]);
    } else if (searchResults.length > 1) {
      const exact = searchResults.find((r) => r.barcode === barcodeInput.trim());
      if (exact) addProductToCart(exact);
    }
  };

  // ─── Hold actions ──────────────────────────────────────────────────────────

  const handleHold = () => {
    if (cartItems.length === 0) return;
    const next = holdCounter + 1;
    setHoldCounter(next);
    const label = `Order #${next}${customerInfo.name ? ` — ${customerInfo.name}` : ""}`;
    const held: HeldOrder = {
      id: `hold-${Date.now()}`,
      heldAt: new Date(),
      cartItems: [...cartItems],
      customerInfo: { ...customerInfo },
      label,
    };
    setHeldOrders((prev) => [...prev, held]);
    // Clear terminal for a new transaction
    setCartItems([]);
    setCashTendered("");
    setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });
  };

  const handleRecall = (holdId: string) => {
    const held = heldOrders.find((h) => h.id === holdId);
    if (!held) return;
    // Put current cart back on hold if it has items
    if (cartItems.length > 0) {
      const next = holdCounter + 1;
      setHoldCounter(next);
      const label = `Order #${next}${customerInfo.name ? ` — ${customerInfo.name}` : ""}`;
      setHeldOrders((prev) => [
        ...prev.filter((h) => h.id !== holdId),
        { id: `hold-${Date.now()}`, heldAt: new Date(), cartItems: [...cartItems], customerInfo: { ...customerInfo }, label },
      ]);
    } else {
      setHeldOrders((prev) => prev.filter((h) => h.id !== holdId));
    }
    setCartItems(held.cartItems);
    setCustomerInfo(held.customerInfo);
    setCashTendered("");
    setShowHolds(false);
  };

  const handleDiscardHold = (holdId: string) => {
    setHeldOrders((prev) => prev.filter((h) => h.id !== holdId));
  };

  // ─── Returns handlers ─────────────────────────────────────────────────────────

  const resetReturnPanel = () => {
    setReturnInvoice("");
    setCustomerSearch("");
    setDateFrom("");
    setDateTo("");
    setSaleSearchResults([]);
    setReturnSale(null);
    setReturnLookupError(null);
    setReturnSubmitError(null);
    setSubmittedReturn(null);
    setSelectedItems({});
  };

  const handleSaleSearch = async () => {
    setReturnLookupLoading(true);
    setReturnLookupError(null);
    setSaleSearchResults([]);
    try {
      const results = await searchSales(
        searchMode === "customer"
          ? { customer_name: customerSearch.trim() }
          : { date_from: dateFrom || undefined, date_to: dateTo || undefined }
      );
      if (results.length === 0) setReturnLookupError("No transactions found.");
      else setSaleSearchResults(results);
    } catch {
      setReturnLookupError("Search failed. Check your connection.");
    } finally {
      setReturnLookupLoading(false);
    }
  };

  const handleReturnLookup = async () => {
    if (!returnInvoice.trim()) return;
    setReturnLookupLoading(true);
    setReturnLookupError(null);
    setReturnSale(null);
    setSelectedItems({});
    setSubmittedReturn(null);
    try {
      const sale = await getSaleByInvoice(returnInvoice.trim());
      setReturnSale(sale);
      const init: typeof selectedItems = {};
      sale.items.forEach((item) => {
        const remaining = item.quantity - item.quantity_returned;
        if (remaining > 0 && item.is_returnable) {
          init[item.id] = {
            checked: false,
            quantity: 1,
            reason: "Damaged",
            scannedBarcode: "",
            barcodeConfirmed: !item.barcode,
          };
        }
      });
      setSelectedItems(init);
    } catch (err: any) {
      const status = err?.response?.status;
      setReturnLookupError(
        status === 404
          ? "Invoice not found."
          : (err?.response?.data?.message ?? "Failed to look up invoice.")
      );
    } finally {
      setReturnLookupLoading(false);
    }
  };

  const handleReturnSubmit = async () => {
    if (!returnSale) return;

    const itemsToReturn = Object.entries(selectedItems)
      .filter(([, v]) => v.checked)
      .map(([idStr, v]) => {
        const saleItemId = Number(idStr);
        const saleItem = returnSale.items.find((i) => i.id === saleItemId)!;
        return {
          sale_item_id: saleItemId,
          product_id: saleItem.product_id,
          quantity_returned: v.quantity,
          unit_price: saleItem.unit_price,
          _barcode: saleItem.barcode,
          _barcodeConfirmed: v.barcodeConfirmed,
          _reason: v.reason,
        };
      });

    if (itemsToReturn.length === 0) {
      setReturnSubmitError("Please select at least one item to return.");
      return;
    }

    const unconfirmed = itemsToReturn.find((i) => i._barcode && !i._barcodeConfirmed);
    if (unconfirmed) {
      setReturnSubmitError("Please scan and confirm the barcode for all selected items.");
      return;
    }

    const firstReason = itemsToReturn[0]._reason;

    setReturnSubmitLoading(true);
    setReturnSubmitError(null);
    try {
      const result = await createReturn({
        sale_id: Number(returnSale.id),
        return_reason: firstReason,
        items: itemsToReturn.map(({ sale_item_id, product_id, quantity_returned, unit_price }) => ({
          sale_item_id: Number(sale_item_id),
          product_id: Number(product_id),
          quantity_returned: Number(quantity_returned),
          unit_price: Number(unit_price),
        })),
      });
      setSubmittedReturn(result);
    } catch (err: any) {
      setReturnSubmitError(err?.response?.data?.message ?? "Failed to submit return request.");
    } finally {
      setReturnSubmitLoading(false);
    }
  };

  const handleFetchForResolution = async (returnId: number): Promise<void> => {
    const ret = await getReturnById(returnId).catch(() => {
      toast.error("Failed to fetch return details. Please try again.");
      throw new Error("fetch_failed");
    });
    if (ret.status !== "approved") {
      toast.error("This return has not been approved yet. Please wait for admin approval.");
      throw new Error("not_approved");
    }
    setResolveData(ret);
    setResolution("refund");
    setItemCondition("good");
    setResolveError(null);
    setShowResolution(true);
  };

  const handleResolve = async () => {
    if (!resolveData) return;
    setResolveLoading(true);
    setResolveError(null);
    try {
      const resolved = await resolveReturn(resolveData.id, {
        resolution,
        item_condition: itemCondition,
      });
      printReturnReceipt({
        return_number: resolved.return_number,
        invoice_number: resolved.invoice_number,
        customer_name: resolved.customer_name,
        processed_by_name: user?.full_name ?? "—",
        resolution: resolved.resolution!,
        item_condition: resolved.item_condition!,
        refund_amount: resolved.refund_amount,
        items: resolved.items.map((i) => ({
          product_name: i.product_name,
          quantity_returned: i.quantity_returned,
          unit_price: i.unit_price,
        })),
        resolved_at: resolved.resolved_at ?? undefined,
        store_name:    storeSettings.store_name,
        store_fb:      storeSettings.store_fb,
        store_phone:   storeSettings.store_phone,
        store_address: storeSettings.store_address,
        store_tin:          storeSettings.business_license,
        store_vat_registered: storeSettings.vat_registered,
        currency:           storeSettings.currency,
      });
      toast.success(
        resolution === "refund"
          ? "Return completed successfully."
          : "Replacement completed successfully."
      );
      setShowResolution(false);
      setResolveData(null);
      setSubmittedReturn(null);
      resetReturnPanel();
    } catch (err: any) {
      setResolveError(err?.response?.data?.message ?? "Failed to process resolution.");
    } finally {
      setResolveLoading(false);
    }
  };

  // ─── Process payment (save sale + print receipt) ──────────────────────────

  const handleProcessPayment = async () => {
    if (cartItems.length === 0 || cashCents < totalCents || !customerInfo.name.trim()) return;
    setIsProcessing(true);
    try {
      // ── Pre-flight: check for price / tax_type drift since items were added ──
      const freshResults = await Promise.allSettled(
        cartItems.map((item) => getProduct(item.id))
      );

      // Check for any product that could not be fetched (deleted / unavailable)
      const unavailable = cartItems.filter((_, idx) => freshResults[idx].status === "rejected");
      if (unavailable.length > 0) {
        toast.error(
          "Some products are no longer available and cannot be sold.",
          { description: `Unavailable: ${unavailable.map((i) => i.name).join(", ")}`, duration: 8000 }
        );
        setIsProcessing(false);
        return;
      }

      const changedNames: string[] = [];
      const refreshedCart = cartItems.map((item, idx) => {
        const result = freshResults[idx];
        if (result.status !== "fulfilled") return item;
        const fresh = result.value;
        const priceChanged = toCentavos(Number(fresh.selling_price)) !== toCentavos(item.unitPrice);
        const taxChanged   = fresh.tax_type !== item.tax_type;
        if (priceChanged || taxChanged) {
          changedNames.push(item.name);
          const newPrice = Number(fresh.selling_price);
          return {
            ...item,
            unitPrice: newPrice,
            subtotal:  Math.round(newPrice * item.quantity * 100) / 100,
            tax_type:  fresh.tax_type,
          };
        }
        return item;
      });

      if (changedNames.length > 0) {
        setCartItems(refreshedCart);
        toast.warning(
          "Some product information has changed. Please review the updated cart before completing the sale.",
          { description: `Updated: ${changedNames.join(", ")}`, duration: 8000 }
        );
        setIsProcessing(false);
        return;
      }

      // ── Submit sale ──────────────────────────────────────────────────────────
      const payload: CreateSalePayload = {
        customer_name:    customerInfo.name || "Walk-in Customer",
        customer_address: customerInfo.address || undefined,
        customer_tin:     customerInfo.tin || undefined,
        subtotal:      subtotalCents / 100,
        vat_amount:    taxCents / 100,
        total_amount:  totalCents / 100,
        cash_tendered: cashCents / 100,
        change_amount: changeCents !== null ? changeCents / 100 : 0,
        items: cartItems.map((item) => ({
          product_id: item.id,
          quantity:   item.quantity,
          unit_price: Number(item.unitPrice),
          subtotal:   Number(item.subtotal),
          tax_type:   item.tax_type,
        })),
      };

      const saleResult = await createSale(payload);
      const { invoice_number } = saleResult;

      // Capture cart + customer before clearing (needed for receipt)
      const receiptCartItems = cartItems;
      const receiptCustomer  = customerInfo;

      // Sale saved — clear cart immediately so cashier can serve next customer
      clearCart();
      setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });

      // Print receipt separately — a print failure does NOT undo the sale
      try {
        printSaleReceipt({
          invoiceNumber:  invoice_number,
          cartItems:      receiptCartItems,
          customerInfo:   receiptCustomer,
          subtotalCents:  Math.round(saleResult.subtotal * 100),
          taxCents:       Math.round(saleResult.vat_amount * 100),
          totalCents:     Math.round(saleResult.total_amount * 100),
          cashCents,
          changeCents:    Math.round(saleResult.change_amount * 100),
          cashierName:    user?.full_name ?? "—",
          settings:       storeSettings,
          itemSnapshots:  saleResult.items,
        });
      } catch {
        toast.warning(`Sale saved (${invoice_number}) but receipt could not print. Allow pop-ups and reprint from Sales history.`);
      }
    } catch (err: any) {
      const message = err?.response?.data?.message ?? "Failed to save transaction. Please try again.";
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });

  return (
    /* Lock to exactly one viewport height — zero scrolling on the outer shell */
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="h-14 shrink-0 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">IH</span>
            </div>
            <span className="font-bold text-gray-900 text-base tracking-tight">Isra Hardware</span>
            <span className="text-gray-300 text-lg">|</span>
            <span className="text-sm font-medium text-blue-600">POS Terminal</span>
          </div>

          {/* Meta */}
          <div className="hidden md:flex items-center gap-5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <LiveClock />
            </span>
            <span className="text-gray-300">·</span>
            <span>{today}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg px-2 py-1.5 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-blue-200">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="font-semibold text-gray-900 text-sm">{user?.full_name ?? "—"}</span>
                  <span className="text-xs text-gray-400">Cashier</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 ml-1" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" sideOffset={6}>
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-900 truncate">{user?.full_name ?? "—"}</p>
                <p className="text-xs text-gray-400 mt-0.5">Cashier</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer text-sm py-2 gap-2"
                onClick={logout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Body (fills remaining height exactly) ───────────── */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden min-h-0">

        {/* ══ LEFT — Barcode + Cart ══════════════════════════ */}
        <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
          {/* Barcode / search input */}
          <div className="shrink-0 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Barcode Scanner / Product Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 z-10" />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin z-10" />
              )}
              <Input
                ref={barcodeRef}
                value={barcodeInput}
                onChange={(e) => handleBarcodeChange(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder="Scan barcode or type product name…"
                className="pl-9 h-11 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
              {/* Search results dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      onMouseDown={() => addProductToCart(product)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left transition-colors border-b border-gray-50 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{product.product_name}</p>
                        <p className="text-xs text-gray-400 font-mono">{product.barcode}</p>
                      </div>
                      <div className="ml-3 text-right shrink-0">
                        <p className="text-sm font-bold text-blue-600">₱{Number(product.selling_price).toFixed(2)}</p>
                        <p className={`text-xs ${product.quantity <= 0 ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                          {product.quantity <= 0 ? "Out of stock" : `Stock: ${product.quantity} ${product.unit_abbreviation}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart — takes all remaining left-column height */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-0">

            {/* Cart header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">
                Shopping Cart
                {cartItems.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs">
                    {cartItems.length}
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {/* On Hold badge — always visible when holds exist */}
                {heldOrders.length > 0 && (
                  <button
                    onClick={() => setShowHolds(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors text-amber-700 text-xs font-semibold"
                  >
                    <PauseCircle className="h-3.5 w-3.5" />
                    On Hold
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-xs font-bold">
                      {heldOrders.length}
                    </span>
                  </button>
                )}
                {/* Pending Returns badge */}
                {heldReturns.length > 0 && (
                  <button
                    onClick={() => setShowHeldReturns(true)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors text-xs font-semibold ${
                      heldReturns.some((r) => r.decision)
                        ? "border-green-300 bg-green-50 hover:bg-green-100 text-green-700 animate-pulse"
                        : "border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700"
                    }`}
                  >
                    <Hourglass className="h-3.5 w-3.5" />
                    Pending Returns
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-xs font-bold ${
                      heldReturns.some((r) => r.decision) ? "bg-green-500" : "bg-purple-500"
                    }`}>
                      {heldReturns.length}
                    </span>
                  </button>
                )}
                {cartItems.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Column headers */}
            {cartItems.length > 0 && (
              <div className="shrink-0 grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                <div className="col-span-5">Product</div>
                <div className="col-span-3 text-center">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-2 text-right pr-7">Total</div>
              </div>
            )}

            {/* Scrollable item list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                  <Search className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Cart is empty — scan or search a product</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cartItems.map((item, index) => (
                    <div
                      key={item.id}
                      className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-blue-50/50 transition-colors ${
                        index % 2 === 0 ? "bg-white" : "bg-gray-50/60"
                      }`}
                    >
                      {/* Product name + unit */}
                      <div className="col-span-5 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{item.name}</p>
                        {item.unit && (
                          <span className="inline-block mt-0.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-px font-medium leading-none">
                            {item.unit}
                          </span>
                        )}
                      </div>
                      {/* Qty controls */}
                      <div className="col-span-3 flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => updateQty(item.id, item.quantity - 1)}
                          className="w-7 h-7 rounded-md border border-gray-300 bg-white flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-gray-600 transition-colors"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-9 text-center text-sm font-bold tabular-nums text-gray-900">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.id, item.quantity + 1)}
                          className="w-7 h-7 rounded-md border border-gray-300 bg-white flex items-center justify-center hover:bg-green-50 hover:border-green-300 hover:text-green-600 text-gray-600 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Unit price */}
                      <div className="col-span-2 text-right">
                        <span className="text-sm font-medium text-gray-700 tabular-nums">₱{fmtCents(toCentavos(item.unitPrice))}</span>
                      </div>
                      {/* Subtotal + remove */}
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="text-sm font-bold text-gray-900 tabular-nums">
                          ₱{fmtCents(toCentavos(item.subtotal))}
                        </span>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="ml-1 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══ MIDDLE — Customer Details ══════════════════════ */}
        <div className="w-72 shrink-0 flex flex-col min-h-0">
          <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Customer Details</h3>
              {(customerInfo.name || customerInfo.tin) && (
                <button
                  onClick={() => setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" })}
                  className="ml-auto text-xs text-red-400 hover:text-red-600"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Sold To <span className="text-red-500">*</span></label>
                <Input
                  value={customerInfo.name}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  placeholder="Name or company"
                  className="h-10 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Address</label>
                <Input
                  value={customerInfo.address}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                  placeholder="Street, City, Province"
                  className="h-10 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">TIN</label>
                <Input
                  value={customerInfo.tin}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, tin: e.target.value })}
                  placeholder="000-000-000-000"
                  className="h-10 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Business Style</label>
                <Input
                  value={customerInfo.businessStyle}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, businessStyle: e.target.value })}
                  placeholder="e.g. Trading"
                  className="h-10 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ══ RIGHT — Totals + Cash + Actions ═══════════════ */}
        <div className="w-80 shrink-0 flex flex-col gap-3 min-h-0">
          <div className="shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium tabular-nums">₱{fmtCents(subtotalCents)}</span>
            </div>

            <div className="flex justify-between text-sm text-gray-600">
              <span>VAT ({Number(storeSettings.tax_rate) > 0 ? Number(storeSettings.tax_rate) : 12}%)</span>
              <span className="font-medium tabular-nums">₱{fmtCents(taxCents)}</span>
            </div>

            <div className="border-t border-gray-200 pt-3 flex flex-col gap-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</span>
              <span
                className="font-bold text-blue-600 tabular-nums leading-none"
                style={{ fontSize: "2.5rem" }}
              >
                ₱{fmtCents(totalCents)}
              </span>
            </div>

            {/* Cash tendered */}
            <div className="border-t border-dashed border-gray-200 pt-3 space-y-2">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Cash Tendered
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 font-bold pointer-events-none select-none"
                  style={{ fontSize: "1.4rem", lineHeight: 1, color: "#6b7280" }}
                >₱</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={cashTendered}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, "");
                    if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                      setCashTendered(formatCashDisplay(e.target.value));
                    }
                  }}
                  placeholder="0.00"
                  style={{ fontSize: "1.75rem", lineHeight: 1 }}
                  className={`w-full rounded-md border px-4 pl-12 pr-4 h-14 font-bold text-right tabular-nums tracking-tight outline-none transition-colors
                    focus:ring-2 focus:ring-offset-0
                    ${
                      cashCents > 0 && cashCents < totalCents
                        ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200 text-red-700"
                        : cashCents >= totalCents && cashCents > 0
                        ? "border-green-400 bg-green-50 focus:border-green-500 focus:ring-green-200 text-green-700"
                        : "border-gray-400 bg-white focus:border-blue-500 focus:ring-blue-100 text-gray-900"
                    }`}
                />
              </div>

              {/* Insufficient cash warning */}
              {cashCents > 0 && cashCents < totalCents && (
                <div className="flex justify-between text-xs text-red-600 font-medium bg-red-50 rounded-lg px-3 py-1.5">
                  <span>Short by</span>
                  <span className="tabular-nums">₱{fmtCents(totalCents - cashCents)}</span>
                </div>
              )}

              {/* Change display */}
              {changeCents !== null && (
                <div className={`flex justify-between items-baseline rounded-lg px-3 py-2 ${
                  isExactChange
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-green-50 border border-green-200"
                }`}>
                  <span className={`text-sm font-bold ${isExactChange ? "text-blue-700" : "text-green-700"}`}>
                    {isExactChange ? "Exact Change" : "Change"}
                  </span>
                  <span className={`text-2xl font-bold tabular-nums ${
                    isExactChange ? "text-blue-600" : "text-green-600"
                  }`}>
                    ₱{fmtCents(changeCents)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons — pushed to the bottom */}
          <div className="flex-1 flex flex-col justify-end gap-2">
            <Button
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl gap-2 disabled:opacity-50"
              disabled={cartItems.length === 0 || cashCents < totalCents || !customerInfo.name.trim() || isProcessing}
              onClick={handleProcessPayment}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="h-5 w-5 flex items-center justify-center">₱</span>
              )}
              {isProcessing
                ? "Processing..."
                : !customerInfo.name.trim()
                ? "Enter Customer Name"
                : cashCents > 0 && cashCents < totalCents
                ? "Insufficient Cash"
                : "Process Payment"}
            </Button>
            <div className="space-y-1">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-10 text-sm rounded-xl gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={handleHold}
                  disabled={cartItems.length === 0 || !customerInfo.name.trim()}
                >
                  <PauseCircle className="h-4 w-4" />
                  Hold
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-10 text-sm rounded-xl gap-2 border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={() => setShowReturns(true)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Return
                </Button>
              </div>
              {cartItems.length > 0 && !customerInfo.name.trim() && (
                <p className="text-xs text-center text-amber-600">
                  Fill in <span className="font-semibold">Sold To</span> to proceed
                </p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ══ HELD ORDERS PANEL ══════════════════════════════ */}
      {/* Backdrop */}
      {showHolds && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setShowHolds(false)}
        />
      )}

      {/* Slide-in panel */}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${showHolds ? "translate-x-0" : "translate-x-full"}`}>
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-bold text-gray-900">Held Transactions</h2>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              {heldOrders.length}
            </span>
          </div>
          <button
            onClick={() => setShowHolds(false)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {heldOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
              <PauseCircle className="h-12 w-12 opacity-20" />
              <p className="text-sm">No held transactions</p>
            </div>
          ) : (
            heldOrders.map((hold) => {
              const holdTotalCents = hold.cartItems.reduce((s, i) => s + toCentavos(i.subtotal), 0);
              const holdTax   = Math.round(holdTotalCents * taxRate / (100 + taxRate));
              const holdTotal = holdTotalCents;
              const heldTime  = hold.heldAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

              return (
                <div key={hold.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  {/* Hold label + time */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{hold.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Held at {heldTime}</p>
                    </div>
                    <span className="text-sm font-bold text-blue-600 tabular-nums whitespace-nowrap">
                      ₱{fmtCents(holdTotal)}
                    </span>
                  </div>

                  {/* Item list */}
                  <div className="space-y-1">
                    {hold.cartItems.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs text-gray-600">
                        <span className="truncate mr-2">{item.quantity}× {item.name}</span>
                        <span className="tabular-nums shrink-0">₱{fmtCents(toCentavos(item.subtotal))}</span>
                      </div>
                    ))}
                  </div>

                  {/* Customer if present */}
                  {hold.customerInfo.name && (
                    <p className="text-xs text-gray-500 border-t border-gray-200 pt-2">
                      Customer: <span className="font-medium text-gray-700">{hold.customerInfo.name}</span>
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
                      onClick={() => handleRecall(hold.id)}
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Recall
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-red-600 border-red-200 hover:bg-red-50 text-xs gap-1.5"
                      onClick={() => handleDiscardHold(hold.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Discard
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ══ PENDING RETURNS PANEL ══════════════════════════ */}
      {showHeldReturns && (
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowHeldReturns(false)} />
      )}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${showHeldReturns ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-purple-500" />
            <h2 className="text-base font-bold text-gray-900">Pending Returns</h2>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
              {heldReturns.length}
            </span>
          </div>
          <button onClick={() => setShowHeldReturns(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {heldReturns.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
              <Hourglass className="h-12 w-12 opacity-20" />
              <p className="text-sm">No pending returns</p>
            </div>
          ) : (
            heldReturns.map((hr) => (
              <div key={hr.id} className={`border rounded-xl p-4 space-y-3 ${
                hr.decision === "approved" ? "bg-green-50 border-green-200" :
                hr.decision === "rejected" ? "bg-red-50 border-red-200" :
                "bg-gray-50 border-gray-200"
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 font-mono">{hr.returnNumber}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Invoice: {hr.invoiceNumber}</p>
                    {hr.customerName && (
                      <p className="text-xs text-gray-500">Customer: {hr.customerName}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      Parked at {hr.heldAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {hr.decision === "approved" ? (
                    <span className="shrink-0 text-xs font-semibold text-green-700 bg-green-100 border border-green-300 rounded px-2 py-0.5">✓ Approved</span>
                  ) : hr.decision === "rejected" ? (
                    <span className="shrink-0 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded px-2 py-0.5">✗ Rejected</span>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-200 rounded px-2 py-0.5">Awaiting Approval</span>
                  )}
                </div>
                {hr.decision === "rejected" && (
                  <p className="text-xs text-red-600 bg-red-100 rounded px-2 py-1">
                    Rejected by {hr.adminName}. Inform the customer and discard this request.
                  </p>
                )}
                <div className="flex gap-2">
                  {hr.decision !== "rejected" && (
                    <Button
                      size="sm"
                      className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
                      onClick={() => {
                        setShowHeldReturns(false);
                        handleFetchForResolution(hr.returnId).then(() => {
                          setHeldReturns((prev) => prev.filter((r) => r.id !== hr.id));
                        }).catch(() => {});
                      }}
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      {hr.decision === "approved" ? "Process Now" : "Process"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-red-600 border-red-200 hover:bg-red-50 text-xs gap-1.5"
                    onClick={() => setHeldReturns((prev) => prev.filter((r) => r.id !== hr.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Discard
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ══ RETURNS PANEL ══════════════════════════════════ */}
      {showReturns && (
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setShowReturns(false); resetReturnPanel(); }} />
      )}

      <div className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${showReturns ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-blue-500" />
            <h2 className="text-base font-bold text-gray-900">Process Return</h2>
          </div>
          <button
            onClick={() => { setShowReturns(false); resetReturnPanel(); }}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Search panel */}
          {!returnSale && !submittedReturn && (
            <div className="space-y-3">
              {/* Tabs */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                {(["invoice", "customer", "date"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setSearchMode(mode); setReturnLookupError(null); setSaleSearchResults([]); }}
                    className={`flex-1 py-2 transition-colors ${
                      searchMode === mode
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {mode === "invoice" ? "Invoice #" : mode === "customer" ? "Customer" : "Date"}
                  </button>
                ))}
              </div>

              {/* Invoice search */}
              {searchMode === "invoice" && (
                <div className="flex gap-2">
                  <Input
                    value={returnInvoice}
                    onChange={(e) => setReturnInvoice(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleReturnLookup()}
                    placeholder="e.g. INV-20250120-0001"
                    className="h-10 text-sm flex-1 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleReturnLookup} disabled={returnLookupLoading || !returnInvoice.trim()} className="h-9 px-4">
                    {returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Look Up"}
                  </Button>
                </div>
              )}

              {/* Customer search */}
              {searchMode === "customer" && (
                <div className="flex gap-2">
                  <Input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaleSearch()}
                    placeholder="Customer name…"
                    className="h-10 text-sm flex-1 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSaleSearch} disabled={returnLookupLoading || !customerSearch.trim()} className="h-9 px-4">
                    {returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
                  </Button>
                </div>
              )}

              {/* Date search */}
              {searchMode === "date" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-700 mb-0.5 block">From</label>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 text-sm bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-700 mb-0.5 block">To</label>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 text-sm bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    </div>
                  </div>
                  <Button size="sm" onClick={handleSaleSearch} disabled={returnLookupLoading || (!dateFrom && !dateTo)} className="h-9 w-full">
                    {returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
                  </Button>
                </div>
              )}

              {returnLookupError && (
                <p className="text-xs text-red-600">{returnLookupError}</p>
              )}

              {/* Sale search results list */}
              {saleSearchResults.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2 bg-gray-50 border-b border-gray-200">
                    Select a transaction
                  </p>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {saleSearchResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSaleSearchResults([]);
                          setReturnInvoice(s.invoice_number);
                          setSearchMode("invoice");
                          // auto-lookup
                          setReturnLookupLoading(true);
                          setReturnLookupError(null);
                          setReturnSale(null);
                          setSelectedItems({});
                          setSubmittedReturn(null);
                          getSaleByInvoice(s.invoice_number)
                              .then((sale) => {
                                setReturnSale(sale);
                                const init: typeof selectedItems = {};
                                sale.items.forEach((item) => {
                                  const remaining = item.quantity - item.quantity_returned;
                                  if (remaining > 0 && item.is_returnable) {
                                    init[item.id] = { checked: false, quantity: 1, reason: "Damaged", scannedBarcode: "", barcodeConfirmed: !item.barcode };
                                  }
                                });
                                setSelectedItems(init);
                              })
                              .catch((err: any) => {
                                const status = err?.response?.status;
                                setReturnLookupError(status === 404 ? "Invoice not found." : (err?.response?.data?.message ?? "Failed to look up invoice."));
                              })
                              .finally(() => setReturnLookupLoading(false));
                        }}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 text-left transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.invoice_number}</p>
                          <p className="text-xs text-gray-500">{s.customer_name}</p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-xs font-semibold text-blue-600">₱{Number(s.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
                          <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sale details + item selection */}
          {returnSale && !submittedReturn && (
            <div className="space-y-4">
              {/* Sale header */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice</span>
                  <span className="font-semibold text-gray-900">{returnSale.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium text-gray-700">{returnSale.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="text-gray-700">
                    {new Date(returnSale.created_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select Items to Return</p>
                <div className="space-y-2">
                  {returnSale.items
                    .filter((item) => {
                      const remaining = item.quantity - item.quantity_returned;
                      return remaining > 0 && item.is_returnable;
                    })
                    .map((item) => {
                      const sel = selectedItems[item.id];
                      if (!sel) return null;
                      const remaining = item.quantity - item.quantity_returned;
                      return (
                        <div key={item.id} className={`border rounded-lg p-3 space-y-2 ${sel.checked ? "border-blue-300 bg-blue-50/40" : "border-gray-200 bg-white"}`}>
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={sel.checked}
                              onChange={(e) => setSelectedItems((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], checked: e.target.checked },
                              }))}
                              className="mt-0.5 h-4 w-4 accent-blue-600"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
                              <p className="text-xs text-gray-500">Purchased: {item.quantity} · Returnable: {remaining} · ₱{Number(item.unit_price).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>

                          {sel.checked && (
                            <div className="pl-6 space-y-2">
                              {/* Qty + Reason */}
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <label className="text-xs font-semibold text-gray-700 mb-0.5 block">Return Qty</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={remaining}
                                    value={sel.quantity}
                                    onChange={(e) => {
                                      const v = Math.min(remaining, Math.max(1, Number(e.target.value)));
                                      setSelectedItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], quantity: v } }));
                                    }}
                                    className="w-full h-9 text-sm border border-gray-300 rounded-md px-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="text-xs font-semibold text-gray-700 mb-0.5 block">Reason</label>
                                  <select
                                    value={sel.reason}
                                    onChange={(e) => setSelectedItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], reason: e.target.value } }))}
                                    className="w-full h-9 text-sm border border-gray-300 rounded-md px-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                                  >
                                    <option>Damaged</option>
                                    <option>Missing Items</option>
                                    <option>Wrong Item</option>
                                    <option>Other</option>
                                  </select>
                                </div>
                              </div>

                              {/* Barcode / name verification */}
                              {item.barcode ? (
                                <VerifyProductField
                                  itemId={item.id}
                                  expectedBarcode={item.barcode}
                                  productName={item.product_name}
                                  sel={sel}
                                  setSelectedItems={setSelectedItems}
                                />
                              ) : (
                                <p className="text-xs text-gray-500 italic">No barcode — verify item manually: {item.product_name}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>

              {returnSubmitError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{returnSubmitError}</p>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs"
                  onClick={() => { setReturnSale(null); setReturnInvoice(""); setReturnLookupError(null); setSelectedItems({}); }}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                  onClick={handleReturnSubmit}
                  disabled={returnSubmitLoading || !Object.values(selectedItems).some((v) => v.checked)}
                >
                  {returnSubmitLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Return Request"}
                </Button>
              </div>
            </div>
          )}

          {/* Submitted confirmation */}
          {submittedReturn && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center space-y-2">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <RotateCcw className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-green-800">Return Submitted</p>
                <p className="text-xs font-mono text-green-700 bg-green-100 rounded px-2 py-1">{submittedReturn.return_number}</p>
                <p className="text-xs text-green-700">Direct the customer to wait for admin approval.</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">Once approved by admin:</p>
                <p>Click "Process Return" below to complete the refund or replacement.</p>
              </div>

              <Button
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white text-sm"
                onClick={() => handleFetchForResolution(submittedReturn.id)}
              >
                Process Return
              </Button>

              {/* Park this return and serve the next customer */}
              <Button
                variant="outline"
                className="w-full h-10 text-sm border-amber-200 text-amber-700 hover:bg-amber-50 gap-2"
                onClick={() => {
                  setHeldReturns((prev) => [
                    ...prev,
                    {
                      id: `hret-${Date.now()}`,
                      heldAt: new Date(),
                      returnId: submittedReturn.id,
                      returnNumber: submittedReturn.return_number,
                      invoiceNumber: returnSale?.invoice_number ?? "",
                      customerName: returnSale?.customer_name ?? "",
                    },
                  ]);
                  setShowReturns(false);
                  resetReturnPanel();
                  toast.success("Return parked — serve the next customer.");
                }}
              >
                <Hourglass className="h-4 w-4" />
                Serve Next Customer (Park Return)
              </Button>

              <Button
                variant="outline"
                className="w-full h-9 text-xs text-gray-600"
                onClick={resetReturnPanel}
              >
                Start New Return
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ══ RESOLUTION DIALOG ══════════════════════════════ */}
      <Dialog open={showResolution} onOpenChange={(open) => { if (!open) { setShowResolution(false); setResolveData(null); setResolveError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Return</DialogTitle>
          </DialogHeader>
          {resolveData && (
            <div className="space-y-4">
              <div className="text-xs text-gray-500 space-y-0.5">
                <p>Return: <span className="font-mono font-semibold text-gray-700">{resolveData.return_number}</span></p>
                <p>Invoice: <span className="font-semibold text-gray-700">{resolveData.invoice_number}</span></p>
                <p>Customer: <span className="font-semibold text-gray-700">{resolveData.customer_name}</span></p>
              </div>

              {/* Resolution */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Resolution</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["refund", "replacement"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setResolution(opt)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${resolution === opt ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                    >
                      {opt === "refund" ? "💰 Cash Refund" : "🔄 Replace Same Product"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Item condition */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Item Condition</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["good", "damaged"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setItemCondition(opt)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${itemCondition === opt ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                    >
                      {opt === "good" ? "✅ Good Condition" : "⚠️ Damaged"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {itemCondition === "good" ? "Item will be returned to sellable stock." : "Item will be logged as damaged inventory."}
                </p>
              </div>

              {resolveError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{resolveError}</p>
              )}

              <Button
                className="w-full h-10 bg-green-600 hover:bg-green-700 text-white font-semibold"
                onClick={handleResolve}
                disabled={resolveLoading}
              >
                {resolveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm ${resolution === "refund" ? "Refund" : "Replacement"}`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
