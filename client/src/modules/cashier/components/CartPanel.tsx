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

  // Load on mount and whenever the cart transitions from empty → non-empty
  // so the list is always fresh (admin may have changed discounts mid-session).
  const wasEmptyRef = useRef(true);
  useEffect(() => {
    loadDiscounts();
  }, []);

  useEffect(() => {
    const isEmpty = cartItems.length === 0;
    if (wasEmptyRef.current && !isEmpty) {
      // Cart just got its first item — refresh the discount list
      loadDiscounts();
    }
    wasEmptyRef.current = isEmpty;
  }, [cartItems.length]);

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
        stock:     product.quantity,
      }];
    });
    setBarcodeInput("");
    setShowDropdown(false);
    setSearchResults([]);
    barcodeRef.current?.focus();
  }, [setCartItems, setBarcodeInput, setShowDropdown, setSearchResults, barcodeRef]);

  const handleBarcodeChange = (value: string) => {
    setBarcodeInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) { setShowDropdown(false); setSearchResults([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await lookupProduct(value.trim());
        const filteredResults = results.filter(r => r.pricing_type !== "MARKET_BASED");
        if (filteredResults.length === 1 && filteredResults[0].barcode === value.trim()) {
          addProductToCart(filteredResults[0]);
          setSearchLoading(false);
          return;
        }
        setSearchResults(filteredResults);
        setShowDropdown(filteredResults.length > 0);
      } catch {
        toast.error("Product lookup failed. Check your connection.");
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (searchResults.length === 1) {
      addProductToCart(searchResults[0]);
    } else if (searchResults.length > 1) {
      const exact = searchResults.find((r) => r.barcode === barcodeInput.trim());
      if (exact) addProductToCart(exact);
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
    // Allow digits and a single leading minus (for delete-all then retype)
    if (/^\d*$/.test(value)) {
      setQtyDraft((prev) => ({ ...prev, [id]: value }));
    }
  };

  const commitQtyDraft = (id: number) => {
    const raw = qtyDraft[id];
    if (raw === undefined) return; // not being edited
    const parsed = parseInt(raw, 10);
    const item = cartItems.find((i) => i.id === id);
    if (!item) return;

    if (!raw || isNaN(parsed) || parsed <= 0) {
      // Empty or zero — remove item
      setCartItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      const capped = item.stock !== undefined ? Math.min(parsed, item.stock) : parsed;
      if (item.stock !== undefined && parsed > item.stock) {
        toast.warning(`Only ${item.stock} unit(s) available. Quantity set to ${item.stock}.`);
      }
      updateQty(id, capped);
    }
    // Clear draft so span re-appears
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
      // Discard draft
      setQtyDraft((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
      {/* Barcode / search input */}
      <div className="shrink-0 bg-slate-50 rounded-xl border-2 border-slate-400 px-4 py-3 shadow-sm">
        <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wide mb-2">
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
            onChange={(e) => { if (!noShift) handleBarcodeChange(e.target.value); }}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder={noShift ? "Start your shift to begin scanning…" : "Scan barcode or type product name…"}
            disabled={noShift}
            className="pl-9 h-11 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
            autoFocus={!noShift}
          />
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-slate-400 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onMouseDown={() => addProductToCart(product)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors border-b border-gray-50 last:border-0 hover:bg-blue-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.product_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{product.barcode}</p>
                  </div>
                  <div className="ml-3 text-right shrink-0">
                    <p className="text-sm font-bold text-blue-600">₱{Number(product.selling_price).toFixed(2)}</p>
                    <p className={`text-xs ${product.quantity <= 0 ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                      {product.quantity <= 0 ? "Out of stock" : `Stock: ${formatQuantity(product.quantity, product.unit_abbreviation, product.quantity_type, product.unit_allow_decimal)}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="flex-1 bg-slate-50 rounded-xl border-2 border-slate-400 shadow-sm flex flex-col min-h-0">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">
            Shopping Cart
            {cartItems.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs">
                {cartItems.length}
              </span>
            )}
          </h2>
          {cartItems.length > 0 && (
            <button
              onClick={() => setCartItems([])}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
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
            <div className="col-span-2 text-right pr-7">Total</div>
          </div>
        )}

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
                  className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-slate-100"}`}
                >
                  <div className="col-span-5 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-snug truncate">{item.name}</p>
                    {item.unit && (
                      <span className="inline-block mt-0.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-px font-medium leading-none">
                        {item.unit}
                      </span>
                    )}
                  </div>
                  <div className="col-span-3 flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => updateQty(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-md border-2 border-slate-400 bg-white flex items-center justify-center hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-slate-700 transition-colors"
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
                        className="w-12 text-center text-sm font-bold tabular-nums text-gray-900 border-2 border-blue-400 rounded-md px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    ) : (
                      <span
                        title="Click to edit quantity"
                        onClick={() => setQtyDraft((prev) => ({ ...prev, [item.id]: String(item.quantity) }))}
                        className="w-12 text-center text-sm font-bold tabular-nums text-slate-900 border-2 border-slate-400 rounded-md px-1 py-0.5 hover:border-blue-400 hover:bg-blue-50 transition-colors select-none cursor-text"
                      >
                        {item.quantity}
                      </span>
                    )}
                    <button
                      onClick={() => updateQty(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-md border-2 border-slate-400 bg-white flex items-center justify-center hover:bg-green-50 hover:border-green-300 hover:text-green-600 text-slate-700 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-medium text-slate-700 tabular-nums">₱{fmtCents(toCentavos(item.unitPrice))}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">₱{fmtCents(toCentavos(item.subtotal))}</span>
                    <button
                      onClick={() => setCartItems((prev) => prev.filter((i) => i.id !== item.id))}
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

        {/* Discount Selection */}
        {cartItems.length > 0 && (
          <div className="shrink-0 px-4 py-3 bg-slate-100 border-t border-slate-300">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-slate-600" />
              <label className="text-xs font-semibold text-slate-800 uppercase tracking-wide">Discount</label>
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
                <SelectTrigger className="h-9 text-sm">
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
            {selectedDiscount && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-gray-600">{selectedDiscount.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-amber-600">{selectedDiscount.percentage}%</span>
                  {selectedDiscount.isScPwd && (
                    <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full text-xs font-medium">
                      SC/PWD
                    </span>
                  )}
                  {selectedDiscount.requiresApproval && (
                    <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-xs font-medium">
                      Approval required
                    </span>
                  )}
                  <button
                    onClick={() => setSelectedDiscount(null)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
