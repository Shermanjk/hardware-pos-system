import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import httpClient from "@/shared/api/httpClient";
import { lookupProduct, type CashierProduct } from "@/shared/api/productsApi";
import { formatQuantity } from "@/shared/utils/quantityFormat";
import { Loader2, Minus, Percent, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fmtCents, toCentavos } from "../utils/money";
import type { CartItem } from "../utils/receipt";

// ─── Scanner constants ───────────────────────────────────────────────────────
// Max gap (ms) between keystrokes for them to be treated as one barcode scan.
// Real keyboard-wedge scanners burst keystrokes well under this; manual typing
// is slower.
const SCAN_GAP_MS = 60;
// If a burst goes quiet this long without a trailing Enter (some scanners don't
// send one), process what we have as a completed scan.
const SCAN_IDLE_MS = 150;

/** Per-item qty input draft state (keyed by item id) */
type QtyDraft = Record<number, string>;

interface CartPanelProps {
  cartItems: CartItem[];
  setCartItems: React.Dispatch<React.SetStateAction<CartItem[]>>;
  barcodeInput: string;
  setBarcodeInput: React.Dispatch<React.SetStateAction<string>>;
  searchResults: CashierProduct[];
  setSearchResults: React.Dispatch<React.SetStateAction<CashierProduct[]>>;
  searchLoading: boolean;
  setSearchLoading: React.Dispatch<React.SetStateAction<boolean>>;
  showDropdown: boolean;
  setShowDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  barcodeRef: React.RefObject<HTMLInputElement | null>;
  searchTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  selectedDiscount: { id: number; name: string; percentage: number; requiresApproval: boolean; isScPwd: boolean } | null;
  setSelectedDiscount: React.Dispatch<React.SetStateAction<{ id: number; name: string; percentage: number; requiresApproval: boolean; isScPwd: boolean } | null>>;
  /** When true, scanning/searching is blocked until a shift is started. */
  noShift?: boolean;
}

interface Discount {
  id: number;
  discount_name: string;
  discount_type: string;
  value: number;
  requires_admin_approval: boolean;
  is_sc_pwd: boolean;
}

export default function CartPanel({
  cartItems, setCartItems,
  barcodeInput, setBarcodeInput,
  searchResults, setSearchResults,
  searchLoading, setSearchLoading,
  showDropdown, setShowDropdown,
  barcodeRef, searchTimeoutRef,
  selectedDiscount, setSelectedDiscount,
  noShift = false,
}: CartPanelProps) {

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(false);
  const [qtyDraft, setQtyDraft] = useState<QtyDraft>({});
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const cartListRef = useRef<HTMLDivElement>(null);

  // ── Global scanner refs (keyboard-wedge capture) ─────────────────────────
  // Backing refs for the document-level keydown capture that lets a scan work
  // even when the scan input is not focused. Real keyboard-wedge scanners burst
  // keystrokes well under SCAN_GAP_MS; slow manual typing is much slower.
  const scanBufferRef = useRef("");
  const lastScanKeyTimeRef = useRef(0);
  const scanIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDiscounts = async () => {
    setDiscountsLoading(true);
    try {
      const response = await httpClient.get("/api/discounts/active");
      setDiscounts(response.data);
    } catch (err) {
      console.error("Failed to load discounts:", err);
    } finally {
      setDiscountsLoading(false);
    }
  };

  // Reset or initialize highlighted search item whenever searchResults changes
  useEffect(() => {
    if (searchResults.length > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [searchResults]);

  // Auto-scroll highlighted dropdown item into view
  useEffect(() => {
    if (showDropdown && highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll<HTMLElement>("[data-search-item]");
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, showDropdown]);

  // Load on mount and whenever the cart transitions from empty → non-empty
  const wasEmptyRef = useRef(true);
  useEffect(() => {
    loadDiscounts();
  }, []);

  useEffect(() => {
    const isEmpty = cartItems.length === 0;
    if (wasEmptyRef.current && !isEmpty) {
      loadDiscounts();
    }
    wasEmptyRef.current = isEmpty;
  }, [cartItems.length]);

  // ── Always-hot scan input ─────────────────────────────────────────────────
  useEffect(() => {
    if (noShift) return;
    const inputEl = barcodeRef.current;
    if (!inputEl) return;
    const input: HTMLInputElement = inputEl;

    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Already focused on the scan input — nothing to do.
      if (target === input) return;
      // Don't steal focus from real interactive controls.
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.tagName === "BUTTON" ||
        target.isContentEditable ||
        target.hasAttribute("tabindex") ||
        target.hasAttribute("data-cart-row") ||
        target.hasAttribute("aria-haspopup")
      ) return;
      // Don't steal focus from anything inside a modal dialog, popover, menu, or drawer.
      if (
        target.closest(
          '[role="dialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-drawer="true"]'
        )
      ) return;
      // Otherwise (clicking bare background), snap focus back to the scan input.
      input.focus();
    }

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [noShift, barcodeRef]);

  // When a shift is started, focus the scan input
  useEffect(() => {
    if (!noShift) {
      barcodeRef.current?.focus();
    }
  }, [noShift, barcodeRef]);

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
        barcode:   product.barcode,
        unit:      product.unit_abbreviation,
        quantity:  1,
        unitPrice: price,
        subtotal:  price,
        tax_type:  product.tax_type ?? "VATABLE",
        stock:     product.quantity,
      }];
    });
    setBarcodeInput("");
    setShowDropdown(false);
    setSearchResults([]);
    setHighlightedIndex(-1);
    barcodeRef.current?.focus();
  }, [setCartItems, setBarcodeInput, setShowDropdown, setSearchResults, barcodeRef]);

  // ── Shared barcode/product lookup ──────────────────────────────────────────
  const lookupAndMaybeAdd = useCallback(async (query: string) => {
    setSearchLoading(true);
    try {
      const results = await lookupProduct(query);
      const filteredResults = results.filter(r => r.pricing_type !== "MARKET_BASED");
      if (filteredResults.length === 1 && filteredResults[0].barcode === query) {
        addProductToCart(filteredResults[0]);
        return;
      }
      setSearchResults(filteredResults);
      setShowDropdown(filteredResults.length > 0);
      if (filteredResults.length > 0) setHighlightedIndex(0);
    } catch {
      toast.error("Product lookup failed. Check your connection.");
    } finally {
      setSearchLoading(false);
    }
  }, [addProductToCart]);

  const handleBarcodeChange = (value: string) => {
    setBarcodeInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) { setShowDropdown(false); setSearchResults([]); setHighlightedIndex(-1); return; }
    searchTimeoutRef.current = setTimeout(() => {
      lookupAndMaybeAdd(value.trim());
    }, 300);
  };

  // ── Global keyboard-wedge capture ─────────────────────────────────────────
  const handleScanComplete = useCallback((raw: string) => {
    const code = raw.trim();
    scanBufferRef.current = "";
    if (!code) return;
    setBarcodeInput(code);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    lookupAndMaybeAdd(code);
  }, [lookupAndMaybeAdd, setBarcodeInput, searchTimeoutRef]);

  useEffect(() => {
    if (noShift) return;

    const OVERLAY_SELECTOR =
      '[data-radix-popper-content-wrapper], [data-radix-dialog-content], [data-radix-menu-content], [data-radix-select-content], [data-radix-popover-content]';

    function isTypingArea(el: Element | null): boolean {
      if (!el) return false;
      if (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        (el as HTMLElement).isContentEditable
      ) return true;
      // Cart items row navigation / interactive areas / drawer panels
      if (el.closest('[data-cart-row="true"], [data-cart-list="true"], [data-drawer="true"]')) return true;
      return !!el.closest(
        '[role="dialog"], [role="menu"], [role="listbox"], ' + OVERLAY_SELECTOR
      );
    }

    function handleScannerKeyDown(e: KeyboardEvent) {
      if (noShift) return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;

      // Ignore any keystrokes with modifier keys held (e.g. Alt+C, Ctrl+A)
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl === barcodeRef.current) return;
      if (isTypingArea(activeEl)) return;

      if (
        e.key === "Shift" || e.key === "Control" || e.key === "Alt" ||
        e.key === "Meta" || e.key === "CapsLock" || e.key === "Tab"
      ) return;

      if (e.key === "Enter") {
        if (scanBufferRef.current.trim()) {
          e.preventDefault();
          e.stopPropagation();
          if (scanIdleTimerRef.current) {
            clearTimeout(scanIdleTimerRef.current);
            scanIdleTimerRef.current = null;
          }
          handleScanComplete(scanBufferRef.current);
        }
        return;
      }

      if (e.key.length !== 1) return;

      const now = Date.now();
      if (lastScanKeyTimeRef.current > 0 && now - lastScanKeyTimeRef.current > SCAN_GAP_MS) {
        scanBufferRef.current = "";
      }
      lastScanKeyTimeRef.current = now;
      scanBufferRef.current += e.key;

      if (scanIdleTimerRef.current) clearTimeout(scanIdleTimerRef.current);
      scanIdleTimerRef.current = setTimeout(() => {
        scanIdleTimerRef.current = null;
        if (scanBufferRef.current.trim()) {
          handleScanComplete(scanBufferRef.current);
        }
      }, SCAN_IDLE_MS);
    }

    document.addEventListener("keydown", handleScannerKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleScannerKeyDown, true);
      if (scanIdleTimerRef.current) clearTimeout(scanIdleTimerRef.current);
    };
  }, [noShift, barcodeRef, handleScanComplete]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // ── Search dropdown arrow navigation & selection ────────────────────────
    if (showDropdown && searchResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        setHighlightedIndex(-1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
          addProductToCart(searchResults[highlightedIndex]);
          return;
        }
      }
    }

    if (e.key !== "Enter") return;
    e.preventDefault();

    const query = barcodeInput.trim();
    if (!query) return;

    if (searchResults.length === 1) {
      addProductToCart(searchResults[0]);
    } else if (searchResults.length > 1) {
      const exact = searchResults.find((r) => r.barcode === query);
      if (exact) addProductToCart(exact);
      else if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        addProductToCart(searchResults[highlightedIndex]);
      }
    } else {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      lookupAndMaybeAdd(query);
    }
  };

  const updateQty = (id: number, qty: number) => {
    if (qty <= 0) { setCartItems((prev) => prev.filter((i) => i.id !== id)); return; }
    setCartItems((prev) => prev.map((item) => item.id === id
      ? { ...item, quantity: qty, subtotal: Math.round(qty * toCentavos(Number(item.unitPrice))) / 100 }
      : item
    ));
  };

  const handleQtyInputChange = (id: number, value: string) => {
    if (/^\d*$/.test(value)) {
      setQtyDraft((prev) => ({ ...prev, [id]: value }));
    }
  };

  const commitQtyDraft = (id: number) => {
    const raw = qtyDraft[id];
    if (raw === undefined) return;
    const parsed = parseInt(raw, 10);
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;

    if (!raw || isNaN(parsed) || parsed <= 0) {
      setCartItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      const capped = item.stock !== undefined ? Math.min(parsed, item.stock) : parsed;
      if (item.stock !== undefined && parsed > item.stock) {
        toast.warning(`Only ${item.stock} unit(s) available. Quantity set to ${item.stock}.`);
      }
      updateQty(id, capped);
    }
    setQtyDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: number) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setQtyDraft((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // Cart row keyboard navigation & inline quantity editing
  const handleCartRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, item: CartItem, index: number) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = Math.min(index + 1, cartItems.length - 1);
      const rows = cartListRef.current?.querySelectorAll<HTMLElement>('[data-cart-row="true"]');
      rows?.[nextIndex]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index === 0) {
        barcodeRef.current?.focus();
      } else {
        const prevIndex = Math.max(index - 1, 0);
        const rows = cartListRef.current?.querySelectorAll<HTMLElement>('[data-cart-row="true"]');
        rows?.[prevIndex]?.focus();
      }
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      if (item.stock === undefined || item.quantity < item.stock) {
        updateQty(item.id, item.quantity + 1);
      } else {
        toast.warning(`Only ${item.stock} unit(s) available.`);
      }
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      updateQty(item.id, item.quantity - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setQtyDraft((prev) => ({ ...prev, [item.id]: String(item.quantity) }));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setCartItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.info(`Removed ${item.name} from cart.`);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
      {/* Barcode / search input */}
      <div className="shrink-0 bg-slate-50 rounded-xl border-2 border-slate-400 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wide">
            Barcode Scanner / Product Search
          </label>
          <span className="text-[11px] font-mono text-slate-500 bg-slate-200/80 px-1.5 py-0.5 rounded font-medium">
            F1 / Alt+S
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 z-10" />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin z-10" />
          )}
          <Input
            ref={barcodeRef}
            value={barcodeInput}
            onChange={(e) => { if (!noShift) handleBarcodeChange(e.target.value); }}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder={noShift ? "Start your shift to begin scanning…" : "Scan barcode or type product name… (↑/↓ to navigate, Enter to select)"}
            disabled={noShift}
            className="pl-9 pr-8 h-11 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
            autoFocus={!noShift}
          />
          {showDropdown && searchResults.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-blue-500 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto"
            >
              {searchResults.map((product, idx) => {
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={product.id}
                    data-search-item="true"
                    onMouseDown={() => addProductToCart(product)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors border-b border-gray-100 last:border-0 ${
                      isHighlighted
                        ? "bg-blue-100 border-l-4 border-l-blue-600 text-blue-950 font-medium"
                        : "hover:bg-blue-50 text-gray-900"
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <p title={product.product_name} className="text-sm font-semibold break-words whitespace-normal leading-snug">
                        {product.product_name}
                      </p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{product.barcode}</p>
                    </div>
                    <div className="ml-3 text-right shrink-0">
                      <p className="text-sm font-bold text-blue-600">₱{Number(product.selling_price).toFixed(2)}</p>
                      <p className={`text-xs ${product.quantity <= 0 ? "text-red-500 font-semibold" : "text-gray-500"}`}>
                        {product.quantity <= 0 ? "Out of stock" : `Stock: ${formatQuantity(product.quantity, product.unit_abbreviation, product.quantity_type, product.unit_allow_decimal)}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="flex-1 bg-slate-50 rounded-xl border-2 border-slate-400 shadow-sm flex flex-col min-h-0">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Shopping Cart
              {cartItems.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs">
                  {cartItems.length}
                </span>
              )}
            </h2>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-200 px-1 py-0.5 rounded">
              F2 / Alt+C
            </span>
          </div>
          {cartItems.length > 0 && (
            <button
              onClick={() => setCartItems([])}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear all
            </button>
          )}
        </div>

        {cartItems.length > 0 && (
          <div className="shrink-0 grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-200 border-b border-slate-300 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <div className="col-span-5">Product</div>
            <div className="col-span-3 text-center">Qty</div>
            <div className="col-span-2 text-right">Unit Price</div>
            <div className="col-span-2 text-right">Total</div>
          </div>
        )}

        <div ref={cartListRef} className="flex-1 overflow-y-auto min-h-0" data-cart-list="true">
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
              <Search className="h-10 w-10 opacity-30" />
              <p className="text-sm">Cart is empty — scan or search a product</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {cartItems.map((item, index) => (
                <div
                  key={item.id}
                  data-cart-row="true"
                  tabIndex={0}
                  onKeyDown={(e) => handleCartRowKeyDown(e, item, index)}
                  className={`grid grid-cols-12 gap-2 px-4 py-3 items-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:bg-blue-50/80 ${
                    index % 2 === 0 ? "bg-white" : "bg-slate-100/70"
                  }`}
                >
                  <div className="col-span-5 min-w-0 pr-2">
                    <p
                      title={item.name}
                      className="text-sm font-semibold text-slate-900 leading-snug break-words whitespace-normal"
                    >
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {item.barcode && (
                        <span className="inline-flex items-center text-[11px] font-mono font-medium text-slate-600 bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 leading-none">
                          {item.barcode}
                        </span>
                      )}
                      {item.unit && (
                        <span className="inline-block text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 font-medium leading-none">
                          {item.unit}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-3 flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => updateQty(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-md border-2 border-slate-400 bg-white flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-slate-700 transition-colors active:scale-95"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    {qtyDraft[item.id] !== undefined ? (
                      <input
                        type="number"
                        min={1}
                        max={item.stock}
                        value={qtyDraft[item.id]}
                        onChange={(e) => handleQtyInputChange(item.id, e.target.value)}
                        onBlur={() => commitQtyDraft(item.id)}
                        onKeyDown={(e) => handleQtyKeyDown(e, item.id)}
                        autoFocus
                        className="w-12 text-center text-sm font-bold tabular-nums text-gray-900 border-2 border-blue-500 rounded-md px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        title="Click or press Enter to edit (+ / - to adjust)"
                        onClick={() => setQtyDraft((prev) => ({ ...prev, [item.id]: String(item.quantity) }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setQtyDraft((prev) => ({ ...prev, [item.id]: String(item.quantity) }));
                          } else if (e.key === "+" || e.key === "=") {
                            e.preventDefault();
                            if (item.stock === undefined || item.quantity < item.stock) updateQty(item.id, item.quantity + 1);
                          } else if (e.key === "-" || e.key === "_") {
                            e.preventDefault();
                            updateQty(item.id, item.quantity - 1);
                          }
                        }}
                        className="w-12 text-center text-sm font-bold tabular-nums text-slate-900 border-2 border-slate-400 rounded-md px-1 py-0.5 hover:border-blue-400 hover:bg-blue-50 focus:border-blue-500 focus:bg-blue-50 focus:ring-2 focus:ring-blue-200 outline-none transition-colors select-none cursor-pointer"
                      >
                        {item.quantity}
                      </span>
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        if (item.stock === undefined || item.quantity < item.stock) {
                          updateQty(item.id, item.quantity + 1);
                        } else {
                          toast.warning(`Only ${item.stock} unit(s) available.`);
                        }
                      }}
                      className="w-7 h-7 rounded-md border-2 border-slate-400 bg-white flex items-center justify-center hover:bg-green-50 hover:border-green-300 hover:text-green-600 text-slate-700 transition-colors active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-medium text-slate-700 tabular-nums">₱{fmtCents(toCentavos(item.unitPrice))}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">₱{fmtCents(toCentavos(item.subtotal))}</span>
                    <button
                      type="button"
                      title={`Remove ${item.name} from cart (Delete)`}
                      onClick={() => setCartItems((prev) => prev.filter((i) => i.id !== item.id))}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 border border-transparent transition-all shrink-0 active:scale-95"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discount Selection */}
        {cartItems.length > 0 && (
          <div className="shrink-0 px-4 py-3 bg-slate-100 border-t border-slate-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-slate-600" />
                <label className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Discount</label>
              </div>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-200 px-1 py-0.5 rounded font-medium">
                F4 / Alt+D
              </span>
            </div>
            <div className="mt-2">
              <Select
                value={selectedDiscount?.id.toString() || "none"}
                onValueChange={(value) => {
                  if (value === "none") {
                    setSelectedDiscount(null);
                    return;
                  }
                  const discount = discounts.find((d) => d.id === Number(value));
                  if (discount) {
                    setSelectedDiscount({
                      id: discount.id,
                      name: discount.discount_name,
                      percentage: discount.value,
                      requiresApproval: discount.requires_admin_approval,
                      isScPwd: discount.is_sc_pwd ?? false,
                    });
                  }
                }}
                disabled={discountsLoading || discounts.length === 0}
              >
                <SelectTrigger id="discount-select-trigger" className="h-9 text-sm bg-white border-slate-400">
                  <SelectValue placeholder={discountsLoading ? "Loading discounts..." : discounts.length === 0 ? "No active discounts" : "Select discount"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No discount</SelectItem>
                  {discounts.map((discount) => (
                    <SelectItem key={discount.id} value={discount.id.toString()}>
                      {discount.discount_name} ({discount.value}%)
                      {discount.requires_admin_approval && (
                        <span className="ml-2 text-xs text-amber-600">• Requires approval</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
