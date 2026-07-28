import { useState, useEffect, useRef, useCallback } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { LogOut, Clock, User, ChevronDown, PauseCircle, Hourglass, Ban } from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { createSale, markReceiptPrinted, generateClientTransactionId, type CreateSalePayload } from "@/shared/api/salesApi";
import { getMyVoidRequests, type MyVoidRequest } from "@/shared/api/voidApi";
import { getProduct } from "@/shared/api/productsApi";
import { getReturnById, resolveReturn, getMyPendingReturns, type Return as ReturnFull } from "@/shared/api/returnsApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { toast } from "sonner";
import { useReturnDecisions, useVoidDecisions, type ReturnDecisionNotification, type VoidDecisionNotification } from "@/shared/hooks/useReturnNotifications";
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
import VoidSaleDialog from "../components/VoidSaleDialog";
import CashierVoidRequestsPanel from "../components/CashierVoidRequestsPanel";

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

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

  // Void state
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [showVoidRequests, setShowVoidRequests] = useState(false);
  const [latestVoidDecision, setLatestVoidDecision] = useState<VoidDecisionNotification | null>(null);
  const [pendingVoidRequestsCount, setPendingVoidRequestsCount] = useState(0);

  // Persistent suspended sales (from database)
  const [suspendedSales, setSuspendedSales] = useState<SuspendedSaleApi[]>([]);
  const [suspendedLoading, setSuspendedLoading] = useState(false);

  const [heldReturns, setHeldReturns] = useState<HeldReturn[]>([]);
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

  const fmt = (n: number) => "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // WebSocket return decisions
  useReturnDecisions((n: ReturnDecisionNotification) => {
    setHeldReturns((prev) => prev.map((hr) => hr.returnId === n.id ? { ...hr, decision: n.decision, adminName: n.admin_name } : hr));
    if (n.decision === "approved") toast.success(`Return ${n.return_number} approved by ${n.admin_name}`, { description: `Invoice ${n.invoice_number} · ${n.customer_name}`, duration: 8000 });
    else toast.error(`Return ${n.return_number} rejected by ${n.admin_name}`, { description: `Invoice ${n.invoice_number} · ${n.customer_name}`, duration: 8000 });
  });

  // WebSocket void decisions
  useVoidDecisions((n: VoidDecisionNotification) => {
    setLatestVoidDecision(n);
    setShowVoidRequests(true); // auto-open panel so cashier sees the decision immediately
    if (n.decision === "approved") {
      toast.success(`Void Approved — ${n.invoice_number}`, {
        description: `${fmt(n.total_amount)} · Approved by ${n.admin_name}. Inventory restored.`,
        duration: 10000,
      });
    } else {
      toast.error(`Void Rejected — ${n.invoice_number}`, {
        description: n.rejection_reason ?? `Rejected by ${n.admin_name}`,
        duration: 10000,
      });
    }
  });

  // Cart actions
  const clearCart = () => { setCartItems([]); setCashTendered(""); };

  const handleReturnResolve = async () => {
    if (!resolveData) return;
    setResolveLoading(true); setResolveError(null);
    try {
      await resolveReturn(resolveData.id, { resolution, item_condition: itemCondition });
      toast.success(resolution === "refund" ? "Return completed." : "Replacement completed.");
      setShowResolution(false); setResolveData(null);
      // Remove the resolved return from held returns list
      setHeldReturns((prev) => prev.filter((r) => r.returnId !== resolveData.id));
      // Reload pending returns to update count
      try {
        const data = await getMyPendingReturns();
        const mappedHeldReturns: HeldReturn[] = data.map((r) => ({
          id: String(r.id),
          heldAt: new Date(r.created_at),
          returnId: r.id,
          returnNumber: r.return_number,
          invoiceNumber: r.invoice_number,
          customerName: r.customer_name,
          decision: r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : undefined,
          adminName: r.admin_name || undefined,
        }));
        setHeldReturns(mappedHeldReturns);
      } catch {
        /* silent */
      }
    } catch (err: unknown) { setResolveError(getErrorMessage(err, "Failed.")); }
    finally { setResolveLoading(false); }
  };

  const handleProcessReturn = async (hr: HeldReturn) => {
    setShowHeldReturns(false);
    const ret = await getReturnById(hr.returnId).catch(() => { toast.error("Failed."); throw new Error("fail"); });
    if (ret.status !== "approved") { toast.error("Not approved."); throw new Error("not_approved"); }
    setResolveData(ret); setResolution("refund"); setItemCondition("good"); setResolveError(null); setShowResolution(true);
    setHeldReturns((prev) => prev.filter((r) => r.id !== hr.id));
  };

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

  // Load pending returns on mount
  useEffect(() => {
    const loadPendingReturns = async () => {
      try {
        const data = await getMyPendingReturns();
        const held: HeldReturn[] = data.map((r) => ({
          id: String(r.id),
          heldAt: new Date(r.created_at),
          returnId: r.id,
          returnNumber: r.return_number,
          invoiceNumber: r.invoice_number,
          customerName: r.customer_name,
          decision: r.status === "approved" ? "approved" : undefined,
        }));
        setHeldReturns(held);
      } catch {
        /* silent - may fail if no permissions */
      }
    };
    loadPendingReturns();
  }, []);

  // Load pending void requests on mount
  useEffect(() => {
    const loadVoidRequests = async () => {
      try {
        const data = await getMyVoidRequests();
        setPendingVoidRequestsCount(data.length);
      } catch {
        /* silent - may fail if no permissions */
      }
    };
    loadVoidRequests();
  }, []);


  // Handle hold with persistence
  const handleHold = useCallback(async () => {
    if (cartItems.length === 0) return;
    try {
      const next = holdCounter + 1;
      setHoldCounter(next);
      const label = `Order #${next}${customerInfo.name ? ` — ${customerInfo.name}` : ""}`;
      const cartItemsPayload = cartItems.map(item => ({
        product_id: item.id,
        name: item.name,
        barcode: item.barcode || "",
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        tax_type: item.tax_type as any,
        tax_rate: item.tax_type === "VATABLE" ? taxRate : 0,
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
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to suspend sale."));
    }
  }, [cartItems, customerInfo, holdCounter, loadSuspendedSales]);

  // Recall a suspended sale
  const handleRecall = useCallback(async (holdId: string) => {
    const held = suspendedSales.find((h) => h.suspended_order_id === holdId);
    if (!held) return;
    const restoredItems: CartItem[] = held.cart_data.map(item => ({
      id: item.product_id,
      name: item.name,
      barcode: item.barcode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      tax_type: item.tax_type || "VATABLE",
      tax_rate: item.tax_rate || taxRate,
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
    // Remove the held order from the list after recalling
    try {
      await discardSuspendedSale(holdId);
      loadSuspendedSales();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to remove held order."));
    }
    toast.success(`Resumed: ${held.label || held.suspended_order_id}`);
  }, [suspendedSales, loadSuspendedSales]);

  // Discard a suspended sale
  const handleDiscard = useCallback(async (holdId: string) => {
    try {
      await discardSuspendedSale(holdId);
      loadSuspendedSales();
      toast.success("Suspended transaction discarded.");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to discard."));
    }
  }, [loadSuspendedSales]);

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
      tax_rate: item.tax_rate || taxRate,
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

  // Payments — power-outage safe implementation
  // CRITICAL ORDER OF OPERATIONS:
  //   1. Generate client_transaction_id BEFORE the API call (for idempotency)
  //   2. Call POST /api/sales (creates sale, deducts inventory, commits)
  //   3. Clear cart (sale is committed in DB regardless of receipt success)
  //   4. Print receipt (printer failure does NOT affect sale)
  //   5. Call PATCH /:id/mark-receipt-printed (marks receipt_printed=1 in DB)
  //
  // The receipt printer is NOT the source of truth. The database is.
  // If power fails after step 2 but before step 5, the sale is still valid.
  // After restart, the cashier can find the sale via search and reprint.
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

      // ── Step 1: Generate idempotency key ──────────────────────────────────────
      // This prevents duplicate sales if the request is retried after network failure
      // or if the user accidentally double-clicks the payment button.
      const clientTxnId = generateClientTransactionId();

      // ── Step 2: Create sale via API ───────────────────────────────────────────
      const payload: CreateSalePayload = {
        customer_name: customerInfo.name || "Walk-in Customer",
        customer_address: customerInfo.address || undefined,
        customer_tin: customerInfo.tin || undefined,
        subtotal: subtotalCents / 100,
        vat_amount: taxCents / 100,
        total_amount: totalCents / 100,
        cash_tendered: cashCents / 100,
        change_amount: changeCents ? changeCents / 100 : 0,
        client_transaction_id: clientTxnId,
        items: cartItems.map((i) => ({
          product_id: i.id,
          quantity: i.quantity,
          unit_price: Number(i.unitPrice),
          subtotal: Number(i.subtotal),
          tax_type: i.tax_type,
        })),
      };
      const saleResult = await createSale(payload);

      // ── Step 3: Clear cart (sale is committed in DB) ──────────────────────────
      // IMPORTANT: We save cartItems and customerInfo to local variables BEFORE
      // clearing, so they can be used for receipt printing.
      const printedCartItems = [...cartItems];
      const printedCustomerInfo = { ...customerInfo };
      clearCart();
      setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });

      // ── Step 4: Print receipt ─────────────────────────────────────────────────
      // Printer failure is non-fatal — the sale is already committed.
      let receiptPrinted = false;
      try {
        printSaleReceipt({
          invoiceNumber: saleResult.invoice_number,
          cartItems: printedCartItems,
          customerInfo: printedCustomerInfo,
          subtotalCents: Math.round(saleResult.subtotal * 100),
          taxCents: Math.round(saleResult.vat_amount * 100),
          totalCents: Math.round(saleResult.total_amount * 100),
          cashCents,
          changeCents: Math.round(saleResult.change_amount * 100),
          cashierName: user?.full_name ?? "—",
          settings: storeSettings,
          itemSnapshots: saleResult.items,
        });
        receiptPrinted = true;
      } catch {
        toast.warning("Sale saved but receipt failed to print. You can reprint from the sales history.");
      }

      // ── Step 5: Mark receipt as printed in DB ─────────────────────────────────
      // This is a best-effort call. If it fails, the receipt can be reprinted later.
      if (receiptPrinted) {
        try {
          await markReceiptPrinted(saleResult.id);
        } catch {
          // Non-fatal: the receipt was already printed on the thermal printer.
          // The DB flag just helps with recovery after restart.
          console.warn("Failed to mark receipt as printed in DB, but receipt was printed.");
        }
      }

      if (saleResult._idempotent) {
        toast.info(`Sale already processed: ${saleResult.invoice_number}`, {
          description: "This transaction was already completed. No duplicate was created.",
          duration: 8000,
        });
      } else {
        toast.success(`Sale completed: ${saleResult.invoice_number}`, {
          description: receiptPrinted ? "Receipt printed." : "Receipt not printed.",
          duration: 5000,
        });
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Payment failed. No changes were saved."));
    }
    finally { setIsProcessing(false); }
  };

  const today = new Date().toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">
      <header className="h-14 shrink-0 bg-white border-b-2 border-gray-300 px-6 flex items-center justify-between shadow-sm z-10">
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
        <PaymentPanel subtotalCents={subtotalCents} taxCents={taxCents} totalCents={totalCents} taxRate={taxRate} cashTendered={cashTendered} setCashTendered={setCashTendered} cartLength={cartItems.length} customerName={customerInfo.name} isProcessing={isProcessing} onProcessPayment={handleProcessPayment} onHold={handleHold} onHoldOrders={() => setShowHolds(true)} onReturn={() => setShowReturns(true)} onVoid={() => setShowVoidDialog(true)} onVoidRequests={() => setShowVoidRequests(true)} unseenVoidDecisions={0} pendingReturnsCount={heldReturns.length} hasApprovedReturns={heldReturns.some((r) => r.decision === "approved")} pendingVoidRequestsCount={pendingVoidRequestsCount} pendingHeldOrdersCount={heldOrders.length} />
      </div>

      <HeldOrdersPanel show={showHolds} onClose={() => setShowHolds(false)} heldOrders={heldOrders} taxRate={taxRate} onRecall={handleRecall} onDiscard={handleDiscard} />
      <PendingReturnsPanel show={showHeldReturns} onClose={() => setShowHeldReturns(false)} heldReturns={heldReturns} onProcess={handleProcessReturn} onDiscard={(id: string) => setHeldReturns((prev) => prev.filter((r) => r.id !== id))} />
      <ReturnsPanel show={showReturns} onClose={() => setShowReturns(false)} storeSettings={storeSettings} onHeldReturn={(hr: HeldReturn) => setHeldReturns((prev) => [...prev, hr])} onProcessResolution={(ret: ReturnFull) => { setResolveData(ret); setShowResolution(true); }} onReturnResolved={(returnId: number) => { setHeldReturns((prev) => prev.filter((r) => r.returnId !== returnId)); }} existingHeldReturns={heldReturns} />
      <CashierVoidRequestsPanel show={showVoidRequests} onClose={() => setShowVoidRequests(false)} newDecision={latestVoidDecision} onRequestVoid={() => setShowVoidDialog(true)} />
      <VoidSaleDialog open={showVoidDialog} onClose={() => setShowVoidDialog(false)} />

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
