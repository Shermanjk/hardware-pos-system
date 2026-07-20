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
  X, Search, DollarSign, ChevronDown, PauseCircle, PlayCircle, Loader2, RotateCcw,
} from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { createSale, type CreateSalePayload, getSaleByInvoice, type Sale } from "@/shared/api/salesApi";
import { createReturn, getReturnById, resolveReturn, type Return as ReturnFull } from "@/shared/api/returnsApi";
import { lookupProduct, type CashierProduct } from "@/shared/api/productsApi";
import { printReturnReceipt } from "@/shared/utils/returnReceiptPrinter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
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
  isExactChange: boolean;
  cashierName: string;
}

function printSaleReceipt(params: SaleReceiptParams): void {
  const {
    invoiceNumber,
    cartItems,
    customerInfo,
    subtotalCents,
    taxCents,
    totalCents,
    cashCents,
    changeCents,
    isExactChange,
    cashierName,
  } = params;

  const now     = new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

  const rows = cartItems.map((i) =>
    `<tr>
      <td style="padding:3px 4px;border-bottom:1px solid #eee;">${i.name}</td>
      <td style="padding:3px 4px;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
      <td style="padding:3px 4px;border-bottom:1px solid #eee;text-align:right;">&#8369;${fmtCents(toCentavos(i.unitPrice))}</td>
      <td style="padding:3px 4px;border-bottom:1px solid #eee;text-align:right;">&#8369;${fmtCents(toCentavos(i.subtotal))}</td>
    </tr>`
  ).join("");

  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Receipt ${invoiceNumber}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:12px;color:#111;padding:16px;width:340px}
  .c{text-align:center}.b{font-weight:bold}
  hr{border:none;border-top:1px dashed #999;margin:8px 0}
  .r{display:flex;justify-content:space-between;margin:2px 0}
  .lbl{color:#555}
  table{width:100%;border-collapse:collapse;margin:6px 0}
  th{padding:3px 4px;border-bottom:2px solid #333;font-size:11px;text-align:left}
  .tr td{font-weight:bold;padding:5px 4px 2px}
  .gt{font-size:13px}
  .ft{margin-top:10px;font-size:11px;color:#666;text-align:center}
  @media print{body{padding:0}}
</style></head><body>
<div class="c"><div class="b" style="font-size:15px">ISRA HARDWARE</div>
<div>Point of Sale &amp; Inventory System</div>
<div style="font-size:11px;color:#555;margin-top:3px">Official Receipt</div></div>
<hr/>
<div class="r"><span class="lbl">Invoice No.:</span><span class="b">${invoiceNumber}</span></div>
<div class="r"><span class="lbl">Date:</span><span>${dateStr}</span></div>
<div class="r"><span class="lbl">Time:</span><span>${timeStr}</span></div>
<div class="r"><span class="lbl">Cashier:</span><span>${cashierName}</span></div>
<hr/>
<div class="r"><span class="lbl">Sold To:</span><span class="b">${customerInfo.name || "Walk-in Customer"}</span></div>
${customerInfo.address       ? `<div class="r"><span class="lbl">Address:</span><span>${customerInfo.address}</span></div>` : ""}
${customerInfo.tin           ? `<div class="r"><span class="lbl">TIN:</span><span>${customerInfo.tin}</span></div>` : ""}
${customerInfo.businessStyle ? `<div class="r"><span class="lbl">Business Style:</span><span>${customerInfo.businessStyle}</span></div>` : ""}
<hr/>
<table>
  <thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amt</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr class="tr"><td colspan="3">Subtotal</td><td style="text-align:right">&#8369;${fmtCents(subtotalCents)}</td></tr>
    <tr class="tr"><td colspan="3">VAT (12%)</td><td style="text-align:right">&#8369;${fmtCents(taxCents)}</td></tr>
    <tr class="tr gt"><td colspan="3">TOTAL</td><td style="text-align:right">&#8369;${fmtCents(totalCents)}</td></tr>
    ${cashCents > 0 ? `<tr class="tr"><td colspan="3">Cash Tendered</td><td style="text-align:right">&#8369;${fmtCents(cashCents)}</td></tr>` : ""}
    ${changeCents !== null ? `<tr class="tr" style="color:${isExactChange ? "#555" : "#060"}"><td colspan="3">Change</td><td style="text-align:right">&#8369;${fmtCents(changeCents)}</td></tr>` : ""}
  </tfoot>
</table>
<hr/>
<div class="ft"><p>Thank you for your purchase!</p><p style="margin-top:3px">This serves as your official receipt.</p></div>
<script>window.onload=function(){window.print();window.close();}<\/script>
</body></html>`);
  w.document.close();
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Cashier() {
  const { logout, user } = useAuth();

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

  // ─── Returns state ────────────────────────────────────────────────────────────
  const [showReturns,          setShowReturns]          = useState(false);
  const [returnInvoice,        setReturnInvoice]        = useState("");
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

  // Sum item subtotals in centavos
  const subtotalCents  = cartItems.reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxCents       = Math.round(subtotalCents * 0.12);
  const totalCents     = subtotalCents + taxCents;

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
        ? { ...item, quantity: qty, subtotal: Math.round(qty * toCentavos(item.unitPrice)) / 100 }
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
      return [...prev, {
        id:        product.id,
        name:      product.product_name,
        quantity:  1,
        unitPrice: product.selling_price,
        subtotal:  product.selling_price,
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
    setReturnSale(null);
    setReturnLookupError(null);
    setReturnSubmitError(null);
    setSubmittedReturn(null);
    setSelectedItems({});
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
        sale_id: returnSale.id,
        return_reason: firstReason,
        items: itemsToReturn.map(({ sale_item_id, product_id, quantity_returned, unit_price }) => ({
          sale_item_id, product_id, quantity_returned, unit_price,
        })),
      });
      setSubmittedReturn(result);
    } catch (err: any) {
      setReturnSubmitError(err?.response?.data?.message ?? "Failed to submit return request.");
    } finally {
      setReturnSubmitLoading(false);
    }
  };

  const handleFetchForResolution = async (returnId: number) => {
    try {
      const ret = await getReturnById(returnId);
      if (ret.status !== "approved") {
        toast.error("This return has not been approved yet. Please wait for admin approval.");
        return;
      }
      setResolveData(ret);
      setResolution("refund");
      setItemCondition("good");
      setResolveError(null);
      setShowResolution(true);
    } catch {
      toast.error("Failed to fetch return details. Please try again.");
    }
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
    if (cartItems.length === 0 || cashCents < totalCents) return;
    setIsProcessing(true);
    try {
      const payload: CreateSalePayload = {
        customer_name: customerInfo.name || "Walk-in Customer",
        customer_address: customerInfo.address || undefined,
        customer_tin: customerInfo.tin || undefined,
        subtotal: subtotalCents / 100,
        vat_amount: taxCents / 100,
        total_amount: totalCents / 100,
        cash_tendered: cashCents / 100,
        change_amount: changeCents !== null ? changeCents / 100 : 0,
        items: cartItems.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          subtotal: item.subtotal,
        })),
      };

      const { invoice_number } = await createSale(payload);

      printSaleReceipt({
        invoiceNumber: invoice_number,
        cartItems,
        customerInfo,
        subtotalCents,
        taxCents,
        totalCents,
        cashCents,
        changeCents,
        isExactChange,
        cashierName: user?.full_name ?? "—",
      });

      clearCart();
      setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? "Failed to save transaction. Please try again.";
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Barcode Scanner / Product Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
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
                className="pl-9 h-10 text-sm bg-gray-50 border-gray-200 focus:border-blue-500 focus:bg-white"
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
              <div className="shrink-0 grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <div className="col-span-5">Product</div>
                <div className="col-span-3 text-center">Qty</div>
                <div className="col-span-2 text-right">Price</div>
                <div className="col-span-2 text-right">Total</div>
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
                <div className="divide-y divide-gray-50">
                  {cartItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-blue-50/40 transition-colors"
                    >
                      <div className="col-span-5">
                        <p className="text-sm font-medium text-gray-900 leading-tight">{item.name}</p>
                      </div>
                      <div className="col-span-3 flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateQty(item.id, item.quantity - 1)}
                          className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-600"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.id, item.quantity + 1)}
                          className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-600"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="col-span-2 text-right text-xs text-gray-500 tabular-nums">
                        ₱{fmtCents(toCentavos(item.unitPrice))}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">
                          ₱{fmtCents(toCentavos(item.subtotal))}
                        </span>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="ml-1 w-5 h-5 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
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
            <div className="flex items-center gap-2 mb-3">
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
                <label className="block text-xs text-gray-500 mb-1">Sold To</label>
                <Input
                  value={customerInfo.name}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  placeholder="Name or company"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <Input
                  value={customerInfo.address}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                  placeholder="Street, City, Province"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">TIN</label>
                <Input
                  value={customerInfo.tin}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, tin: e.target.value })}
                  placeholder="000-000-000-000"
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Business Style</label>
                <Input
                  value={customerInfo.businessStyle}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, businessStyle: e.target.value })}
                  placeholder="e.g. Trading"
                  className="h-9 text-sm"
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
              <span>VAT (12%)</span>
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Cash Tendered
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 font-bold pointer-events-none select-none"
                  style={{ fontSize: "1.4rem", lineHeight: 1, color: "#9ca3af" }}
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
                        ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200 text-red-700"
                        : cashCents >= totalCents && cashCents > 0
                        ? "border-green-300 bg-green-50 focus:border-green-400 focus:ring-green-200 text-green-700"
                        : "border-gray-300 bg-gray-50 focus:border-blue-400 focus:ring-blue-100 text-gray-900"
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
              disabled={cartItems.length === 0 || cashCents < totalCents || isProcessing}
              onClick={handleProcessPayment}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="h-5 w-5 flex items-center justify-center">₱</span>
              )}
              {isProcessing
                ? "Processing..."
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
                  Fill in <span className="font-semibold">Sold To</span> before holding
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
              const holdSubtotalCents = hold.cartItems.reduce((s, i) => s + toCentavos(i.subtotal), 0);
              const holdTax   = Math.round(holdSubtotalCents * 0.12);
              const holdTotal = holdSubtotalCents + holdTax;
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

          {/* Invoice lookup */}
          {!returnSale && !submittedReturn && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Invoice Number
                </label>
                <div className="flex gap-2">
                  <Input
                    value={returnInvoice}
                    onChange={(e) => setReturnInvoice(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleReturnLookup()}
                    placeholder="e.g. INV-20250120-0001"
                    className="h-9 text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={handleReturnLookup}
                    disabled={returnLookupLoading || !returnInvoice.trim()}
                    className="h-9 px-4"
                  >
                    {returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Look Up"}
                  </Button>
                </div>
                {returnLookupError && (
                  <p className="text-xs text-red-600 mt-1">{returnLookupError}</p>
                )}
              </div>
              <p className="text-xs text-gray-400">
                Ask the customer for their receipt and enter the invoice number above.
              </p>
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
                                  <label className="text-xs text-gray-500 mb-0.5 block">Return Qty</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={remaining}
                                    value={sel.quantity}
                                    onChange={(e) => {
                                      const v = Math.min(remaining, Math.max(1, Number(e.target.value)));
                                      setSelectedItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], quantity: v } }));
                                    }}
                                    className="w-full h-8 text-sm border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="text-xs text-gray-500 mb-0.5 block">Reason</label>
                                  <select
                                    value={sel.reason}
                                    onChange={(e) => setSelectedItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], reason: e.target.value } }))}
                                    className="w-full h-8 text-sm border border-gray-300 rounded-md px-2 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                  >
                                    <option>Damaged</option>
                                    <option>Missing Items</option>
                                    <option>Wrong Item</option>
                                    <option>Other</option>
                                  </select>
                                </div>
                              </div>

                              {/* Barcode verification */}
                              {item.barcode ? (
                                <div>
                                  <label className="text-xs text-gray-500 mb-0.5 block">Scan Product Barcode to Verify</label>
                                  <div className="flex gap-2">
                                    <Input
                                      value={sel.scannedBarcode}
                                      onChange={(e) => setSelectedItems((prev) => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], scannedBarcode: e.target.value, barcodeConfirmed: false },
                                      }))}
                                      placeholder="Scan or enter barcode"
                                      className="h-8 text-sm flex-1"
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs"
                                      onClick={() => {
                                        if (sel.scannedBarcode === item.barcode) {
                                          setSelectedItems((prev) => ({ ...prev, [item.id]: { ...prev[item.id], barcodeConfirmed: true } }));
                                        } else {
                                          toast.error(`Barcode mismatch for ${item.product_name}.`);
                                        }
                                      }}
                                    >
                                      Confirm
                                    </Button>
                                  </div>
                                  {sel.barcodeConfirmed && (
                                    <p className="text-xs text-green-600 mt-0.5">✓ Barcode verified</p>
                                  )}
                                </div>
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
