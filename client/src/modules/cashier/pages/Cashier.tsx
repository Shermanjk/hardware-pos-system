import { useState, useEffect, useRef, useCallback } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { LogOut, Clock, User, ChevronDown, PauseCircle, Hourglass, TrendingUp } from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { createSale, type CreateSalePayload } from "@/shared/api/salesApi";
import { getProduct } from "@/shared/api/productsApi";
import { getReturnById, resolveReturn, type Return as ReturnFull } from "@/shared/api/returnsApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getApprovedCommodityPurchases, recordPayment as recordCommodityPayment,
  type CommodityPurchase,
} from "@/shared/api/commodityApi";
import { toast } from "sonner";
import { useReturnDecisions, type ReturnDecisionNotification } from "@/shared/hooks/useReturnNotifications";
import { toCentavos, parseCashInput } from "../utils/money";
import { printSaleReceipt } from "../utils/receipt";
import CartPanel from "../components/CartPanel";
import CustomerPanel from "../components/CustomerPanel";
import PaymentPanel from "../components/PaymentPanel";
import HeldOrdersPanel from "../components/HeldOrdersPanel";
import PendingReturnsPanel from "../components/PendingReturnsPanel";
import ReturnsPanel from "../components/ReturnsPanel";
import type { CartItem, CustomerInfo } from "../utils/receipt";
import type { HeldOrder } from "../components/HeldOrdersPanel";
import type { HeldReturn } from "../components/PendingReturnsPanel";
import { getSuspendedSales, suspendSale, discardSuspendedSale, type SuspendedSale as SuspendedSaleApi } from "@/shared/api/suspendedSalesApi";

function LiveClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm tabular-nums">{time}</span>;
}

export default function Cashier() {
  const { logout, user } = useAuth();
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({ store_name: "", store_fb: "", store_phone: "", store_address: "", currency: "PHP", tax_rate: 0, business_license: "", registered_taxpayer_name: "", tin: "", document_type: "SALES INVOICE", pos_min: "", pos_serial: "", vat_registered: false });

  useEffect(() => { getSettings().then(setStoreSettings).catch(() => {}); }, []);

  // Cart state
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Payment state
  const [cashTendered, setCashTendered] = useState("");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ name: "", address: "", tin: "", businessStyle: "" });
  const [holdCounter, setHoldCounter] = useState(0);
  const [showHolds, setShowHolds] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Persistent suspended sales (from database)
  const [suspendedSales, setSuspendedSales] = useState<SuspendedSaleApi[]>([]);
  const [suspendedLoading, setSuspendedLoading] = useState(false);

  const [heldReturns, setHeldReturns] = useState< HeldReturn[]>([]);
  const [showHeldReturns, setShowHeldReturns] = useState(false);
  const [showReturns, setShowReturns] = useState(false);
  const [resolveData, setResolveData] = useState<ReturnFull | null>(null);
  const [showResolution, setShowResolution] = useState(false);
  const [resolution, setResolution] = useState<"refund" | "replacement">("refund");
  const [itemCondition, setItemCondition] = useState<"good" | "damaged">("good");
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Calculations
  const totalCents = cartItems.reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxRate = storeSettings.tax_rate > 0 ? storeSettings.tax_rate : 12;
  const vatableCents = cartItems.filter((i) => i.tax_type === "VATABLE").reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxCents = Math.round(vatableCents * taxRate / (100 + taxRate));
  const subtotalCents = totalCents - taxCents;
  const cashCents = parseCashInput(cashTendered);
  const changeCents = cashCents >= totalCents ? cashCents - totalCents : null;

  // WebSocket return decisions
  useReturnDecisions((n: ReturnDecisionNotification) => {
    setHeldReturns((prev) => prev.map((hr) => hr.returnId === n.id ? { ...hr, decision: n.decision, adminName: n.admin_name } : hr));
    if (n.decision === "approved") toast.success(`Return ${n.return_number} approved by ${n.admin_name}`, { description: `Invoice ${n.invoice_number} · ${n.customer_name}`, duration: 8000 });
    else toast.error(`Return ${n.return_number} rejected by ${n.admin_name}`, { description: `Invoice ${n.invoice_number} · ${n.customer_name}`, duration: 8000 });
  });

  // Cart actions
  const clearCart = () => { setCartItems([]); setCashTendered(""); };

  const handleReturnResolve = async () => {
    if (!resolveData) return;
    setResolveLoading(true); setResolveError(null);
    try {
      const resolved = await resolveReturn(resolveData.id, { resolution, item_condition: itemCondition });
      toast.success(resolution === "refund" ? "Return completed." : "Replacement completed.");
      setShowResolution(false); setResolveData(null);
    } catch (err: any) { setResolveError(err?.response?.data?.message ?? "Failed."); }
    finally { setResolveLoading(false); }
  };

  const handleProcessReturn = async (hr: HeldReturn) => {
    setShowHeldReturns(false);
    const ret = await getReturnById(hr.returnId).catch(() => { toast.error("Failed."); throw new Error("fail"); });
    if (ret.status !== "approved") { toast.error("Not approved."); throw new Error("not_approved"); }
    setResolveData(ret); setResolution("refund"); setItemCondition("good"); setResolveError(null); setShowResolution(true);
    setHeldReturns((prev) => prev.filter((r) => r.id !== hr.id));
  };

  // Commodity payment state
  const [commodityPurchases, setCommodityPurchases] = useState<CommodityPurchase[]>([]);
  const [commodityLoading, setCommodityLoading] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<CommodityPurchase | null>(null);
  const [commodityPayAmount, setCommodityPayAmount] = useState("");
  const [commodityPayMethod, setCommodityPayMethod] = useState("CASH");
  const [commodityPayRef, setCommodityPayRef] = useState("");
  const [commodityPaying, setCommodityPaying] = useState(false);

  // Load persistent suspended sales on mount
  const loadSuspendedSales = useCallback(async () => {
    setSuspendedLoading(true);
    try {
      const data = await getSuspendedSales();
      setSuspendedSales(data);
    } catch { /* silent */ }
    setSuspendedLoading(false);
  }, []);

  useEffect(() => { loadSuspendedSales(); }, [loadSuspendedSales]);

  // Handle hold with persistence
  const handleHold = useCallback(async () => {
    if (cartItems.length === 0) return;
    try {
      const next = holdCounter + 1;
      setHoldCounter(next);
      const label = `Order #${next}${customerInfo.name ? ` — ${customerInfo.name}` : ""}`;
      
      // Convert CartItem to SuspendedCartItem format
      const cartItemsPayload = cartItems.map(item => ({
        product_id: item.id,
        name: item.name,
        barcode: item.barcode || "",
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        tax_type: item.tax_type as any,
        tax_rate: item.tax_type === "VATABLE" ? 12 : 0,
        taxable_amount: item.taxable_amount,
        vat_amount: item.vat_amount,
      }));

      await suspendSale({
        customer_name: customerInfo.name,
        customer_address: customerInfo.address,
        customer_tin: customerInfo.tin,
        cart_items: cartItemsPayload,
        label,
      });

      toast.success("Transaction suspended and saved.");
      loadSuspendedSales();
      clearCart(); 
      setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to suspend sale.");
    }
  }, [cartItems, customerInfo, holdCounter, loadSuspendedSales]);

  // Recall a suspended sale
  const handleRecall = useCallback((holdId: string) => {
    const held = suspendedSales.find((h) => h.suspended_order_id === holdId);
    if (!held) return;
    
    // Convert persisted cart data back to CartItem format
    const restoredItems: CartItem[] = held.cart_data.map(item => ({
      id: item.product_id,
      name: item.name,
      barcode: item.barcode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      tax_type: item.tax_type || "VATABLE",
      tax_rate: item.tax_rate || 12,
      taxable_amount: item.taxable_amount || 0,
      vat_amount: item.vat_amount || 0,
    }));

    setCartItems(restoredItems);
    setCustomerInfo({
      name: held.customer_name || "",
      address: held.customer_address || "",
      tin: held.customer_tin || "",
      businessStyle: "",
    });
    setCashTendered("");
    setShowHolds(false);
    toast.success(`Resumed: ${held.label || held.suspended_order_id}`);
  }, [suspendedSales]);

  // Discard a suspended sale
  const handleDiscard = useCallback(async (holdId: string) => {
    try {
      await discardSuspendedSale(holdId);
      loadSuspendedSales();
      toast.success("Suspended transaction discarded.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to discard.");
    }
  }, [loadSuspendedSales]);

  // Convert HeldOrder to SuspendedSale format for backward compatibility panel
  const heldOrders: HeldOrder[] = suspendedSales.map(s => ({
    id: s.suspended_order_id,
    heldAt: new Date(s.updated_at),
    cartItems: s.cart_data.map(item => ({
      id: item.product_id,
      name: item.name,
      barcode: item.barcode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      tax_type: item.tax_type || "VATABLE",
      tax_rate: item.tax_rate || 12,
      taxable_amount: item.taxable_amount || 0,
      vat_amount: item.vat_amount || 0,
    })),
    customerInfo: {
      name: s.customer_name || "",
      address: s.customer_address || "",
      tin: s.customer_tin || "",
      businessStyle: "",
    },
    label: s.label || s.suspended_order_id,
  }));

  // Load approved commodity purchases for payment
  const loadCommodityPurchases = useCallback(async () => {
    setCommodityLoading(true);
    try {
      const data = await getApprovedCommodityPurchases();
      setCommodityPurchases(data);
    } catch { /* silent */ }
    setCommodityLoading(false);
  }, []);

  useEffect(() => { loadCommodityPurchases(); }, [loadCommodityPurchases]);

  // Handle commodity payment
  const handleCommodityPayment = async () => {
    if (!selectedPurchase) return;
    const amount = parseFloat(commodityPayAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid payment amount."); return; }
    if (amount > selectedPurchase.balance_due) { toast.error("Payment cannot exceed the remaining balance."); return; }
    setCommodityPaying(true);
    try {
      const result = await recordCommodityPayment(selectedPurchase.id, {
        amount,
        payment_method: commodityPayMethod || null,
        payment_reference: commodityPayRef.trim() || null,
      });
      toast.success(
        `Payment of ₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} recorded. ` +
        `Status: ${result.payment_status}`
      );
      setSelectedPurchase(null);
      setCommodityPayAmount("");
      setCommodityPayRef("");
      loadCommodityPurchases();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Payment failed.");
    } finally {
      setCommodityPaying(false);
    }
  };

  // Payments
  const handleProcessPayment = async () => {
    if (cartItems.length === 0 || cashCents < totalCents || !customerInfo.name.trim()) return;
    setIsProcessing(true);
    try {
      const freshResults = await Promise.allSettled(cartItems.map((item) => getProduct(item.id)));
      const unavailable = cartItems.filter((_, idx) => freshResults[idx].status === "rejected");
      if (unavailable.length > 0) { toast.error(`Unavailable: ${unavailable.map((i) => i.name).join(", ")}`); setIsProcessing(false); return; }

      const changedNames: string[] = [];
      const refreshedCart = cartItems.map((item, idx) => {
        const result = freshResults[idx];
        if (result.status !== "fulfilled") return item;
        const fresh = result.value;
        const priceChanged = toCentavos(Number(fresh.selling_price)) !== toCentavos(item.unitPrice);
        const taxChanged = fresh.tax_type !== item.tax_type;
        if (priceChanged || taxChanged) { changedNames.push(item.name); return { ...item, unitPrice: Number(fresh.selling_price), subtotal: Math.round(Number(fresh.selling_price) * item.quantity * 100) / 100, tax_type: fresh.tax_type }; }
        return item;
      });

      if (changedNames.length > 0) { setCartItems(refreshedCart); toast.warning(`Updated: ${changedNames.join(", ")}`); setIsProcessing(false); return; }

      const payload: CreateSalePayload = { customer_name: customerInfo.name || "Walk-in Customer", customer_address: customerInfo.address || undefined, customer_tin: customerInfo.tin || undefined, subtotal: subtotalCents / 100, vat_amount: taxCents / 100, total_amount: totalCents / 100, cash_tendered: cashCents / 100, change_amount: changeCents ? changeCents / 100 : 0, items: cartItems.map((i) => ({ product_id: i.id, quantity: i.quantity, unit_price: Number(i.unitPrice), subtotal: Number(i.subtotal), tax_type: i.tax_type })) };
      const saleResult = await createSale(payload);
      const receiptCartItems = cartItems; const receiptCustomer = customerInfo;
      clearCart(); setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });
      try { printSaleReceipt({ invoiceNumber: saleResult.invoice_number, cartItems: receiptCartItems, customerInfo: receiptCustomer, subtotalCents: Math.round(saleResult.subtotal * 100), taxCents: Math.round(saleResult.vat_amount * 100), totalCents: Math.round(saleResult.total_amount * 100), cashCents, changeCents: Math.round(saleResult.change_amount * 100), cashierName: user?.full_name ?? "—", settings: storeSettings, itemSnapshots: saleResult.items }); } catch { toast.warning("Sale saved but receipt failed."); }
    } catch (err: any) { toast.error(err?.response?.data?.message ?? "Failed."); }
    finally { setIsProcessing(false); }
  };

  const today = new Date().toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">
      <header className="h-14 shrink-0 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white font-bold text-xs">IH</span></div>
            <span className="font-bold text-gray-900 text-base">Isra Hardware</span>
            <span className="text-gray-300 text-lg">|</span>
            <span className="text-sm font-medium text-blue-600">POS Terminal</span>
          </div>
          <div className="hidden md:flex items-center gap-5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /><LiveClock /></span>
            <span className="text-gray-300">·</span><span>{today}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg px-2 py-1.5">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><User className="h-4 w-4 text-blue-600" /></div>
                <div className="flex flex-col items-start"><span className="font-semibold text-gray-900 text-sm">{user?.full_name ?? "—"}</span><span className="text-xs text-gray-400">Cashier</span></div>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <div className="px-3 py-2 border-b border-gray-100"><p className="text-xs font-semibold truncate">{user?.full_name ?? "—"}</p><p className="text-xs text-gray-400">Cashier</p></div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 gap-2" onClick={logout}><LogOut className="h-4 w-4" />Logout</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex-1 flex gap-3 p-3 overflow-hidden min-h-0">
        <CartPanel cartItems={cartItems} setCartItems={setCartItems} barcodeInput={barcodeInput} setBarcodeInput={setBarcodeInput} searchResults={searchResults} setSearchResults={setSearchResults} searchLoading={searchLoading} setSearchLoading={setSearchLoading} showDropdown={showDropdown} setShowDropdown={setShowDropdown} barcodeRef={barcodeRef} searchTimeoutRef={searchTimeout} />
        <CustomerPanel customerInfo={customerInfo} setCustomerInfo={setCustomerInfo} />
        <PaymentPanel subtotalCents={subtotalCents} taxCents={taxCents} totalCents={totalCents} taxRate={taxRate} cashTendered={cashTendered} setCashTendered={setCashTendered} cartLength={cartItems.length} customerName={customerInfo.name} isProcessing={isProcessing} onProcessPayment={handleProcessPayment} onHold={handleHold} onReturn={() => setShowReturns(true)} />
      </div>

      {/* Badges */}
      {heldOrders.length > 0 && <button onClick={() => setShowHolds(true)} className="fixed bottom-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold z-30"><PauseCircle className="h-3.5 w-3.5" />On Hold<span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-xs">{heldOrders.length}</span></button>}
      {/* Commodity Payment Section */}
      {commodityPurchases.length > 0 && (
        <div className="fixed bottom-4 right-4 z-30">
          <div className="bg-amber-50 border border-amber-200 rounded-lg shadow-lg p-3 w-72">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-bold text-amber-800">Commodity Payments</span>
              <span className="ml-auto bg-amber-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {commodityPurchases.filter((p) => p.payment_status !== "PAID").length}
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1.5">
              {commodityPurchases.slice(0, 5).map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPurchase(p); setCommodityPayAmount(String(p.balance_due)); }}
                  className={`w-full text-left p-2 rounded border text-xs ${selectedPurchase?.id === p.id ? "border-amber-500 bg-amber-100" : "border-amber-200 bg-white hover:bg-amber-50"}`}
                >
                  <p className="font-semibold text-gray-900 truncate">{p.product_name}</p>
                  <p className="text-gray-500">₱{p.balance_due.toLocaleString("en-PH", { minimumFractionDigits: 2 })} due</p>
                  <span className={`inline-block px-1 py-0.5 rounded text-xs font-medium mt-1 ${p.payment_status === "PAID" ? "bg-green-100 text-green-700" : p.payment_status === "PARTIALLY_PAID" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                    {p.payment_status}
                  </span>
                </button>
              ))}
            </div>
            {commodityPurchases.length > 5 && (
              <p className="text-xs text-amber-600 mt-2 text-center">+{commodityPurchases.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {/* Commodity Payment Modal */}
      {selectedPurchase && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setSelectedPurchase(null)}>
          <div className="bg-white rounded-xl p-5 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-amber-600" />
              <h3 className="text-lg font-bold">Record Seller Payment</h3>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="font-semibold text-gray-900">{selectedPurchase.product_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">Seller: {selectedPurchase.seller || "—"}</p>
              <p className="text-xs text-gray-500">Qty: {Number(selectedPurchase.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {selectedPurchase.unit_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-500">Final Amount</p>
                <p className="font-bold text-gray-900">₱{Number(selectedPurchase.final_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-500">Amount Paid</p>
                <p className="font-bold text-green-600">₱{Number(selectedPurchase.amount_paid).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="p-2 bg-gray-50 rounded col-span-2">
                <p className="text-xs text-gray-500">Remaining Balance</p>
                <p className="font-bold text-red-600">₱{selectedPurchase.balance_due.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Payment Amount <span className="text-red-500">*</span></Label>
              <Input
                type="number" min="0.01" step="0.01"
                value={commodityPayAmount}
                onChange={(e) => setCommodityPayAmount(e.target.value)}
                className="h-10"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Payment Method</Label>
              <Select value={commodityPayMethod} onValueChange={setCommodityPayMethod}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHECK">Check</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-700 mb-1 block">Reference No. <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input
                placeholder="e.g. OR-12345"
                value={commodityPayRef}
                onChange={(e) => setCommodityPayRef(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setSelectedPurchase(null)} className="flex-1">Cancel</Button>
              <Button
                onClick={handleCommodityPayment}
                disabled={commodityPaying || !commodityPayAmount}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-2"
              >
                {commodityPaying ? "Processing..." : "Record Payment"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {heldReturns.length > 0 && <button onClick={() => setShowHeldReturns(true)} className={`fixed bottom-4 left-36 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold z-30 ${heldReturns.some((r) => r.decision) ? "border-green-300 bg-green-50 text-green-700" : "border-purple-200 bg-purple-50 text-purple-700"}`}><Hourglass className="h-3.5 w-3.5" />Pending Returns<span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-xs ${heldReturns.some((r) => r.decision) ? "bg-green-500" : "bg-purple-500"}`}>{heldReturns.length}</span></button>}

      <HeldOrdersPanel show={showHolds} onClose={() => setShowHolds(false)} heldOrders={heldOrders} taxRate={taxRate} onRecall={handleRecall} onDiscard={handleDiscard} />
      <PendingReturnsPanel show={showHeldReturns} onClose={() => setShowHeldReturns(false)} heldReturns={heldReturns} onProcess={handleProcessReturn} onDiscard={(id: string) => setHeldReturns((prev) => prev.filter((r) => r.id !== id))} />
      <ReturnsPanel show={showReturns} onClose={() => setShowReturns(false)} storeSettings={storeSettings} onHeldReturn={(hr: HeldReturn) => setHeldReturns((prev) => [...prev, hr])} onProcessResolution={(ret: ReturnFull) => { setResolveData(ret); setShowResolution(true); }} />

      {showResolution && resolveData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowResolution(false)}>
          <div className="bg-white rounded-xl p-6 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Process Return</h3>
            <div className="text-xs text-gray-500"><p>Return: <span className="font-mono">{resolveData.return_number}</span></p></div>
            <div className="grid grid-cols-2 gap-2">
              {(["refund", "replacement"] as const).map((opt) => (<button key={opt} onClick={() => setResolution(opt)} className={`p-3 rounded-lg border-2 text-sm font-medium ${resolution === opt ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>{opt === "refund" ? "💰 Refund" : "🔄 Replace"}</button>))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["good", "damaged"] as const).map((opt) => (<button key={opt} onClick={() => setItemCondition(opt)} className={`p-3 rounded-lg border-2 text-sm font-medium ${itemCondition === opt ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}>{opt === "good" ? "✅ Good" : "⚠️ Damaged"}</button>))}
            </div>
            {resolveError && <p className="text-xs text-red-600">{resolveError}</p>}
            <button onClick={handleReturnResolve} disabled={resolveLoading} className="w-full h-10 bg-green-600 text-white rounded-lg">{resolveLoading ? "Processing..." : `Confirm ${resolution === "refund" ? "Refund" : "Replacement"}`}</button>
          </div>
        </div>
      )}
    </div>
  );
}