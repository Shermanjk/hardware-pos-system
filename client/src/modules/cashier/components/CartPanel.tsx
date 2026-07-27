import { useRef, useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Minus, Plus, X, Trash2, AlertTriangle } from "lucide-react";
import { lookupProduct, type CashierProduct } from "@/shared/api/productsApi";
import { toast } from "sonner";
import { toCentavos, fmtCents } from "../utils/money";
import type { CartItem } from "../utils/receipt";
import { formatQuantity, formatQuantityParts } from "@/shared/utils/quantityFormat";

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
}

export default function CartPanel({
  cartItems, setCartItems,
  barcodeInput, setBarcodeInput,
  searchResults, setSearchResults,
  searchLoading, setSearchLoading,
  showDropdown, setShowDropdown,
  barcodeRef, searchTimeoutRef,
}: CartPanelProps) {

  const [marketBasedAlert, setMarketBasedAlert] = useState<string | null>(null);

  const addProductToCart = useCallback((product: CashierProduct) => {
    if (product.pricing_type === "MARKET_BASED") {
      setMarketBasedAlert(product.product_name);
      setBarcodeInput("");
      setShowDropdown(false);
      setSearchResults([]);
      return;
    }
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
  }, [setCartItems, setBarcodeInput, setShowDropdown, setSearchResults, barcodeRef]);

  const handleBarcodeChange = (value: string) => {
    setBarcodeInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) { setShowDropdown(false); setSearchResults([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await lookupProduct(value.trim());
        if (results.length === 1 && results[0].barcode === value.trim()) {
          addProductToCart(results[0]); // will block if MARKET_BASED
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

  return (
    <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
      {/* Barcode / search input */}
      <div className="shrink-0 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
          Barcode Scanner / Product Search
        </label>

        {/* Market-based product block alert */}
        {marketBasedAlert && (
          <div className="mb-2 flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-300 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">{marketBasedAlert}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This is a Market-Based Product. It cannot be sold through the Cashier Terminal.
                Purchase and payment are handled through the Admin commodity purchase workflow.
              </p>
            </div>
            <button onClick={() => setMarketBasedAlert(null)} className="text-amber-500 hover:text-amber-700 shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 z-10" />
          {searchLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin z-10" />
          )}
          <Input
            ref={barcodeRef}
            value={barcodeInput}
            onChange={(e) => handleBarcodeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            placeholder="Scan barcode or type product name…"
            className="pl-9 h-11 text-sm bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            autoFocus
          />
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  onMouseDown={() => addProductToCart(product)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors border-b border-gray-50 last:border-0 ${
                    product.pricing_type === "MARKET_BASED"
                      ? "bg-amber-50 hover:bg-amber-100 cursor-not-allowed"
                      : "hover:bg-blue-50"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.product_name}</p>
                    <p className="text-xs text-gray-400 font-mono">{product.barcode}</p>
                    {product.pricing_type === "MARKET_BASED" && (
                      <p className="text-xs text-amber-600 font-semibold mt-0.5">Market-Based — not available at cashier</p>
                    )}
                  </div>
                  <div className="ml-3 text-right shrink-0">
                    {product.pricing_type === "MARKET_BASED" ? (
                      <p className="text-xs text-amber-500 font-semibold">N/A</p>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-blue-600">₱{Number(product.selling_price).toFixed(2)}</p>
                        <p className={`text-xs ${product.quantity <= 0 ? "text-red-500 font-semibold" : "text-gray-400"}`}>
                          {product.quantity <= 0 ? "Out of stock" : `Stock: ${formatQuantity(product.quantity, product.unit_abbreviation, product.quantity_type)}`}
                        </p>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-0">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">
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
          <div className="shrink-0 grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
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
                  className={`grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                >
                  <div className="col-span-5 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{item.name}</p>
                    {item.unit && (
                      <span className="inline-block mt-0.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-px font-medium leading-none">
                        {item.unit}
                      </span>
                    )}
                  </div>
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
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-medium text-gray-700 tabular-nums">₱{fmtCents(toCentavos(item.unitPrice))}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">₱{fmtCents(toCentavos(item.subtotal))}</span>
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
      </div>
    </div>
  );
}
