import { useState, useEffect, useRef, useCallback } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { LogOut, Clock, User, ChevronDown, WifiOff } from "lucide-react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { createSale, markReceiptPrinted, generateClientTransactionId, type CreateSalePayload } from "@/shared/api/salesApi";
import { getMyVoidRequests, type MyVoidRequest } from "@/shared/api/voidApi";
import { getProduct } from "@/shared/api/productsApi";
import { getReturnById, resolveReturn, getMyPendingReturns, type Return as ReturnFull } from "@/shared/api/returnsApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import httpClient from "@/shared/api/httpClient";
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

// ─── Polling constants ────────────────────────────────────────────────────────
const HEALTH_POLL_MS   = 15_000; // check server reachability every 15 s
const PENDING_POLL_MS  = 60_000; // refresh pending returns/voids every 60 s

// ─── mergeReturns ─────────────────────────────────────────────────────────────
// Merge a freshly-polled list with the in-memory list.
// Rules:
//   - All polled items are included (they are the authoritative server state).
//   - Items in `current` that are absent from `polled` AND have no `decision`
//     (not yet acknowledged by cashier) are preserved — they may be in-flight.
//   - Acknowledged items (decision set) that the server no longer returns are
//     dropped — the cashier has already handled them.
function mergeReturns(current: HeldReturn[], polled: HeldReturn[]): HeldReturn[] {
  const polledIds = new Set(polled.map((r) => r.returnId));
  const unacknowledged = current.filter(
    (r) => !polledIds.has(r.returnId) && !r.decision
  );
  return [...polled, ...unacknowledged];
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function LiveClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  useEffect(() => {
    const id = setInterval(
      () => setTime(new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })),
      1000
    );
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm tabular-nums">{time}</span>;
}

export default function Cashier() {
  const { logout, user } = useAuth();
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    store_name: "", store_fb: "", store_phone: "", store_address: "",
    currency: "PHP", tax_rate: 0, business_license: "", registered_taxpayer_name: "",
    tin: "", document_type: "SALES INVOICE", pos_min: "", pos_serial: "", vat_registered: false,
  });
  useEffect(() => { getSettings().then(setStoreSettings).catch(() => {}); }, []);

  // ── Offline indicator ─────────────────────────────────────────────────────
  // Polls GET /api/health every 15 s. When unreachable, shows a red banner and
  // disables the payment button so the cashier doesn't attempt doomed transactions.
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    async function checkHealth() {
      try {
        await httpClient.get("/api/health", { timeout: 5_000 });
        setIsOffline(false);
      } catch {
        setIsOffline(true);
      }
    }
    checkHealth();
    const id = setInterval(checkHealth, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, []);

  // ── Cart state ────────────────────────────────────────────────────────────
  const [cartItems, setCartItems]       = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeRef    = useRef<HTMLInputElement>(null);

  // ── Payment state ─────────────────────────────────────────────────────────
  const [cashTendered, setCashTendered]   = useState("");
  const [customerInfo, setCustomerInfo]   = useState<CustomerInfo>({ name: "", address: "", tin: "", businessStyle: "" });
  const [holdCounter, setHoldCounter]     = useState(0);
  const [showHolds, setShowHolds]         = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);

  // ── Void state ────────────────────────────────────────────────────────────
  const [showVoidDialog, setShowVoidDialog]         = useState(false);
  const [showVoidRequests, setShowVoidRequests]     = useState(false);
  const [latestVoidDecision, setLatestVoidDecision] = useState<VoidDecisionNotification | null>(null);
  const [pendingVoidRequestsCount, setPendingVoidRequestsCount] = useState(0);

  // ── Suspended sales ───────────────────────────────────────────────────────
  const [suspendedSales, setSuspendedSales]     = useState<SuspendedSaleApi[]>([]);
  const [suspendedLoading, setSuspendedLoading] = useState(false);

  // ── Return state ──────────────────────────────────────────────────────────
  const [heldReturns, setHeldReturns]       = useState<HeldReturn[]>([]);
  const [showHeldReturns, setShowHeldReturns] = useState(false);
  const [showReturns, setShowReturns]         = useState(false);
  const [resolveData, setResolveData]         = useState<ReturnFull | null>(null);
  const [showResolution, setShowResolution]   = useState(false);
  const [resolution, setResolution]           = useState<"refund" | "replacement">("refund");
  const [itemCondition, setItemCondition]     = useState<"good" | "damaged">("good");
  const [resolveLoading, setResolveLoading]   = useState(false);
  const [resolveError, setResolveError]       = useState<string | null>(null);

  // ── Calculations ──────────────────────────────────────────────────────────
  const totalCents    = cartItems.reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxRate       = storeSettings.tax_rate > 0 ? storeSettings.tax_rate : 12;
  const vatableCents  = cartItems.filter((i) => i.tax_type === "VATABLE").reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxCents      = Math.round(vatableCents * taxRate / (100 + taxRate));
  const subtotalCents = totalCents - taxCents;
  const cashCents     = parseCashInput(cashTendered);
  const changeCents   = cashCents >= totalCents ? cashCents - totalCents : null;
  const fmt = (n: number) => "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Unified pending data fetch (returns + voids) ──────────────────────────
  // Replaces the two separate one-shot useEffects that ran on mount only.
  // Now runs every 60 s so stale data after a missed WS notification is
  // recovered automatically, without requiring a page reload.
  const fetchPendingData = useCallback(async () => {
    const [returnsResult, voidsResult] = await Promise.allSettled([
      getMyPendingReturns(),
      getMyVoidRequests(),
    ]);

    if (returnsResult.status === "fulfilled") {
      const polled: HeldReturn[] = returnsResult.value.map((r) => ({
        id: String(r.id),
        heldAt: new Date(r.created_at),
        returnId: r.id,
        returnNumber: r.return_number,
        invoiceNumber: r.invoice_number,
        customerName: r.customer_name,
        decision:
          r.status === "waiting_for_cashier" || r.status === "approved"
            ? "waiting_for_cashier"
            : undefined,
        adminName: r.admin_name || undefined,
      }));
      setHeldReturns((prev) => mergeReturns(prev, polled));
    }
    // If the fetch failed, retain last known list — no state update.

    if (voidsResult.status === "fulfilled") {
      setPendingVoidRequestsCount(voidsResult.value.length);
    }
  }, []);

  // Initial load + 60 s recurring poll. Pauses when tab is hidden.
  useEffect(() => {
    fetchPendingData();
    const id = setInterval(fetchPendingData, PENDING_POLL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") fetchPendingData();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchPendingData]);

  // ── WebSocket return decisions ─────────────────────────────────────────────
  // After updating local state from the WS push, trigger an HTTP reconcile so
  // any items missed during a brief disconnect are also picked up.
  useReturnDecisions((n: ReturnDecisionNotification) => {
    setHeldReturns((prev) =>
      prev.map((hr) =>
        hr.returnId === n.id
          ? { ...hr, decision: n.decision === "approved" ? "waiting_for_cashier" : n.decision, adminName: n.admin_name }
          : hr
      )
    );
    if (n.decision === "approved")
      toast.success(`Return ${n.return_number} approved by ${n.admin_name}`, { description: `Invoice ${n.invoice_number} · ${n.customer_name}`, duration: 8000 });
    else
      toast.error(`Return ${n.return_number} rejected by ${n.admin_name}`, { description: `Invoice ${n.invoice_number} · ${n.customer_name}`, duration: 8000 });
    // Reconcile with server state in case WS reconnect missed other events
    fetchPendingData();
  });

  // ── WebSocket void decisions ──────────────────────────────────────────────
  useVoidDecisions((n: VoidDecisionNotification) => {
    setLatestVoidDecision(n);
    setShowVoidRequests(true);
    if (n.decision === "approved")
      toast.success(`Void Approved — ${n.invoice_number}`, { description: `${fmt(n.total_amount)} · Approved by ${n.admin_name}. Inventory restored.`, duration: 10000 });
    else
      toast.error(`Void Rejected — ${n.invoice_number}`, { description: n.rejection_reason ?? `Rejected by ${n.admin_name}`, duration: 10000 });
    fetchPendingData();
  });

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const clearCart = () => { setCartItems([]); setCashTendered(""); };

  const handleReturnResolve = async () => {
    if (!resolveData) return;
    setResolveLoading(true); setResolveError(null);
    try {
      await resolveReturn(resolveData.id, { resolution, item_condition: itemCondition });
      toast.success(resolution === "refund" ? "Return completed." : "Replacement completed.");
      setShowResolution(false); setResolveData(null);
      setHeldReturns((prev) => prev.filter((r) => r.returnId !== resolveData.id));
      fetchPendingData();
    } catch (err: unknown) { setResolveError(getErrorMessage(err, "Failed.")); }
    finally { setResolveLoading(false); }
  };

  const handleProcessReturn = async (hr: HeldReturn) => {
    setShowHeldReturns(false);
    const ret = await getReturnById(hr.returnId).catch(() => { toast.error("Failed."); throw new Error("fail"); });
    if (ret.status !== "waiting_for_cashier") { toast.error("Not approved yet."); throw new Error("not_approved"); }
    setResolveData(ret); setResolution("refund"); setItemCondition("good"); setResolveError(null); setShowResolution(true);
    setHeldReturns((prev) => prev.filter((r) => r.id !== hr.id));
  };

  // ── Suspended sales ───────────────────────────────────────────────────────
  const loadSuspendedSales = useCallback(async () => {
    setSuspendedLoading(true);
    try { const data = await getSuspendedSales(); setSuspendedSales(data); }
    catch { /* silent */ }
    setSuspendedLoading(false);
  }, []);
  useEffect(() => { loadSuspendedSales(); }, [loadSuspendedSales]);

  const handleHold = useCallback(async () => {
    if (cartItems.length === 0) return;
    try {
      const next  = holdCounter + 1;
      setHoldCounter(next);
      const label = `Order #${next}${customerInfo.name ? ` — ${customerInfo.name}` : ""}`;
      await suspendSale({
        customer_name: customerInfo.name, customer_address: customerInfo.address,
        customer_tin: customerInfo.tin,
        cart_items: cartItems.map(item => ({
          product_id: item.id, name: item.name, barcode: item.barcode || "",
          quantity: item.quantity, unitPrice: Number(item.unitPrice), subtotal: Number(item.subtotal),
          tax_type: item.tax_type as any, tax_rate: item.tax_type === "VATABLE" ? taxRate : 0,
          taxable_amount: item.taxable_amount, vat_amount: item.vat_amount,
        })),
        label,
      });
      toast.success("Transaction suspended and saved.");
      loadSuspendedSales(); clearCart();
      setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });
    } catch (err: unknown) { toast.error(getErrorMessage(err, "Failed to suspend sale.")); }
  }, [cartItems, customerInfo, holdCounter, loadSuspendedSales]);

  const handleRecall = useCallback(async (holdId: string) => {
    const held = suspendedSales.find((h) => h.suspended_order_id === holdId);
    if (!held) return;
    setCartItems(held.cart_data.map(item => ({
      id: item.product_id, name: item.name, barcode: item.barcode,
      quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal,
      tax_type: item.tax_type || "VATABLE", tax_rate: item.tax_rate || taxRate,
      taxable_amount: item.taxable_amount || 0, vat_amount: item.vat_amount || 0,
    })));
    setCustomerInfo({ name: held.customer_name || "", address: held.customer_address || "", tin: held.customer_tin || "", businessStyle: "" });
    setCashTendered(""); setShowHolds(false);
    try { await discardSuspendedSale(holdId); loadSuspendedSales(); }
    catch (err: unknown) { toast.error(getErrorMessage(err, "Failed to remove held order.")); }
    toast.success(`Resumed: ${held.label || held.suspended_order_id}`);
  }, [suspendedSales, loadSuspendedSales]);

  const handleDiscard = useCallback(async (holdId: string) => {
    try { await discardSuspendedSale(holdId); loadSuspendedSales(); toast.success("Suspended transaction discarded."); }
    catch (err: unknown) { toast.error(getErrorMessage(err, "Failed to discard.")); }
  }, [loadSuspendedSales]);

  const heldOrders: HeldOrder[] = suspendedSales.map(s => ({
    id: s.suspended_order_id, heldAt: new Date(s.updated_at),
    cartItems: s.cart_data.map(item => ({
      id: item.product_id, name: item.name, barcode: item.barcode,
      quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal,
      tax_type: item.tax_type || "VATABLE", tax_rate: item.tax_rate || taxRate,
      taxable_amount: item.taxable_amount || 0, vat_amount: item.vat_amount || 0,
    })),
    customerInfo: { name: s.customer_name || "", address: s.customer_address || "", tin: s.customer_tin || "", businessStyle: "" },
    label: s.label || s.suspended_order_id,
  }));

  // ── Payment processing ────────────────────────────────────────────────────
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
        const taxChanged   = fresh.tax_type !== item.tax_type;
        if (priceChanged || taxChanged) {
          changedNames.push(item.name);
          return { ...item, unitPrice: Number(fresh.selling_price), subtotal: Math.round(Number(fresh.selling_price) * item.quantity * 100) / 100, tax_type: fresh.tax_type };
        }
        return item;
      });
      if (changedNames.length > 0) { setCartItems(refreshedCart); toast.warning(`Updated: ${changedNames.join(", ")}`); setIsProcessing(false); return; }

      const clientTxnId = generateClientTransactionId();
      const payload: CreateSalePayload = {
        customer_name: customerInfo.name || "Walk-in Customer",
        customer_address: customerInfo.address || undefined,
        customer_tin: customerInfo.tin || undefined,
        subtotal: subtotalCents / 100, vat_amount: taxCents / 100, total_amount: totalCents / 100,
        cash_tendered: cashCents / 100, change_amount: changeCents ? changeCents / 100 : 0,
        client_transaction_id: clientTxnId,
        items: cartItems.map((i) => ({ product_id: i.id, quantity: i.quantity, unit_price: Number(i.unitPrice), subtotal: Number(i.subtotal), tax_type: i.tax_type })),
      };
      const saleResult = await createSale(payload);

      const printedCartItems    = [...cartItems];
      const printedCustomerInfo = { ...customerInfo };
      clearCart();
      setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });

      let receiptPrinted = false;
      try {
        printSaleReceipt({ invoiceNumber: saleResult.invoice_number, cartItems: printedCartItems, customerInfo: printedCustomerInfo, subtotalCents: Math.round(saleResult.subtotal * 100), taxCents: Math.round(saleResult.vat_amount * 100), totalCents: Math.round(saleResult.total_amount * 100), cashCents, changeCents: Math.round(saleResult.change_amount * 100), cashierName: user?.full_name ?? "—", settings: storeSettings, itemSnapshots: saleResult.items });
        receiptPrinted = true;
      } catch {
        toast.warning("Sale saved but receipt failed to print. You can reprint from the sales history.");
      }
      if (receiptPrinted) {
        try { await markReceiptPrinted(saleResult.id); }
        catch { console.warn("Failed to mark receipt as printed in DB, but receipt was printed."); }
      }
      if (saleResult._idempotent)
        toast.info(`Sale already processed: ${saleResult.invoice_number}`, { description: "This transaction was already completed. No duplicate was created.", duration: 8000 });
      else
        toast.success(`Sale completed: ${saleResult.invoice_number}`, { description: receiptPrinted ? "Receipt printed." : "Receipt not printed.", duration: 5000 });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Payment failed. No changes were saved."));
    } finally { setIsProcessing(false); }
  };

  const today = new Date().toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <header className="h-14 shrink-0 bg-white border-b-2 border-gray-300 px-6 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">IH</span>
            </div>
            <span className="font-bold text-gray-900 text-base">Isra Hardware</span>
            <span className="text-gray-300 text-lg">|</span>
            <span className="text-sm font-medium text-blue-600">POS Terminal</span>
          </div>
          <div className="hidden md:flex items-center gap-5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /><LiveClock />
            </span>
            <span className="text-gray-300">·</span>
            <span>{today}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Offline badge in header (compact) */}
          {isOffline && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-100 border border-red-300 rounded-lg">
              <WifiOff className="h-3.5 w-3.5 text-red-600" />
              <span className="text-xs font-semibold text-red-700">Offline</span>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg px-2 py-1.5">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-semibold text-gray-900 text-sm">{user?.full_name ?? "—"}</span>
                  <span className="text-xs text-gray-400">Cashier</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold truncate">{user?.full_name ?? "—"}</p>
                <p className="text-xs text-gray-400">Cashier</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 gap-2" onClick={logout}>
                <LogOut className="h-4 w-4" />Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Offline banner ─────────────────────────────────────────────────── */}
      {/* Full-width red banner below header. Clearly visible without blocking  */}
      {/* the POS UI. Payment button is also disabled via the isOffline prop.   */}
      {isOffline && (
        <div className="shrink-0 bg-red-600 text-white text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2 z-10">
          <WifiOff className="h-4 w-4" />
          Server Unreachable — Transactions Unavailable. Waiting to reconnect…
        </div>
      )}

      {/* Main POS area */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden min-h-0">
        <CartPanel
          cartItems={cartItems} setCartItems={setCartItems}
          barcodeInput={barcodeInput} setBarcodeInput={setBarcodeInput}
          searchResults={searchResults} setSearchResults={setSearchResults}
          searchLoading={searchLoading} setSearchLoading={setSearchLoading}
          showDropdown={showDropdown} setShowDropdown={setShowDropdown}
          barcodeRef={barcodeRef} searchTimeoutRef={searchTimeout}
        />
        <CustomerPanel customerInfo={customerInfo} setCustomerInfo={setCustomerInfo} />
        <PaymentPanel
          subtotalCents={subtotalCents} taxCents={taxCents}
          totalCents={totalCents} taxRate={taxRate}
          cashTendered={cashTendered} setCashTendered={setCashTendered}
          cartLength={cartItems.length} customerName={customerInfo.name}
          isProcessing={isProcessing} isOffline={isOffline}
          onProcessPayment={handleProcessPayment}
          onHold={handleHold}
          onHoldOrders={() => setShowHolds(true)}
          onReturn={() => setShowReturns(true)}
          onPendingReturns={() => setShowHeldReturns(true)}
          onVoid={() => setShowVoidDialog(true)}
          onVoidRequests={() => setShowVoidRequests(true)}
          pendingReturnsCount={heldReturns.length}
          hasApprovedReturns={heldReturns.some(
            (r) => r.decision === "waiting_for_cashier" || r.decision === "approved"
          )}
          pendingVoidRequestsCount={pendingVoidRequestsCount}
          pendingHeldOrdersCount={heldOrders.length}
        />
      </div>

      {/* Panels */}
      <HeldOrdersPanel
        show={showHolds} onClose={() => setShowHolds(false)}
        heldOrders={heldOrders} taxRate={taxRate}
        onRecall={handleRecall} onDiscard={handleDiscard}
      />
      <PendingReturnsPanel
        show={showHeldReturns} onClose={() => setShowHeldReturns(false)}
        heldReturns={heldReturns} onProcess={handleProcessReturn}
        onDiscard={(id: string) => setHeldReturns((prev) => prev.filter((r) => r.id !== id))}
      />
      <ReturnsPanel
        show={showReturns} onClose={() => setShowReturns(false)}
        storeSettings={storeSettings}
        onHeldReturn={(hr: HeldReturn) => setHeldReturns((prev) => [...prev, hr])}
        onProcessResolution={(ret: ReturnFull) => { setResolveData(ret); setShowResolution(true); }}
        onReturnResolved={(returnId: number) => {
          setHeldReturns((prev) => prev.filter((r) => r.returnId !== returnId));
        }}
        existingHeldReturns={heldReturns}
      />
      <CashierVoidRequestsPanel
        show={showVoidRequests} onClose={() => setShowVoidRequests(false)}
        newDecision={latestVoidDecision}
        onRequestVoid={() => setShowVoidDialog(true)}
      />
      <VoidSaleDialog open={showVoidDialog} onClose={() => setShowVoidDialog(false)} />

      {/* Return resolution modal */}
      {showResolution && resolveData && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
          onClick={() => setShowResolution(false)}
        >
          <div className="bg-white rounded-xl p-6 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Process Return</h3>
            <div className="text-xs text-gray-500">
              <p>Return: <span className="font-mono">{resolveData.return_number}</span></p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["refund", "replacement"] as const).map((opt) => (
                <button
                  key={opt} onClick={() => setResolution(opt)}
                  className={`p-3 rounded-lg border-2 text-sm font-medium ${
                    resolution === opt ? "border-blue-500 bg-blue-50" : "border-gray-200"
                  }`}
                >
                  {opt === "refund" ? "💰 Refund" : "🔄 Replace"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["good", "damaged"] as const).map((opt) => (
                <button
                  key={opt} onClick={() => setItemCondition(opt)}
                  className={`p-3 rounded-lg border-2 text-sm font-medium ${
                    itemCondition === opt ? "border-blue-500 bg-blue-50" : "border-gray-200"
                  }`}
                >
                  {opt === "good" ? "✅ Good" : "⚠️ Damaged"}
                </button>
              ))}
            </div>
            {resolveError && <p className="text-xs text-red-600">{resolveError}</p>}
            <button
              onClick={handleReturnResolve} disabled={resolveLoading}
              className="w-full h-10 bg-green-600 text-white rounded-lg font-semibold"
            >
              {resolveLoading ? "Processing…" : `Confirm ${resolution === "refund" ? "Refund" : "Replacement"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
