import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getMySession } from "@/shared/api/cashReconciliationApi";
import httpClient from "@/shared/api/httpClient";
import { getProduct } from "@/shared/api/productsApi";
import { getMyPendingReturns } from "@/shared/api/returnsApi";
import { createSale, generateClientTransactionId, markReceiptPrinted, type CreateSalePayload } from "@/shared/api/salesApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { discardSuspendedSale, getSuspendedSales, suspendSale, type SuspendedSale as SuspendedSaleApi } from "@/shared/api/suspendedSalesApi";
import { getMyVoidRequests } from "@/shared/api/voidApi";
import DraftRecoveryPrompt from "@/shared/components/DraftRecoveryPrompt";
import { useAuth } from "@/shared/contexts/AuthContext";
import { DRAFT_KEYS, useDraftRecovery } from "@/shared/hooks/useDraftRecovery";
import { useReturnDecisions, useVoidDecisions, type ReturnDecisionNotification, type VoidDecisionNotification } from "@/shared/hooks/useReturnNotifications";
import { ChevronDown, Clock, LogOut, PowerOff, User, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import CartPanel from "../components/CartPanel";
import CashierVoidRequestsPanel from "../components/CashierVoidRequestsPanel";
import CustomerPanel from "../components/CustomerPanel";
import DiscountApprovalModal from "../components/DiscountApprovalModal";
import EndShiftModal from "../components/EndShiftModal";
import type { HeldOrder } from "../components/HeldOrdersPanel";
import HeldOrdersPanel from "../components/HeldOrdersPanel";
import PaymentPanel from "../components/PaymentPanel";
import type { HeldReturn } from "../components/PendingReturnsPanel";
import PendingReturnsPanel from "../components/PendingReturnsPanel";
import ReturnsPanel from "../components/ReturnsPanel";
import VoidSaleDialog from "../components/VoidSaleDialog";
import { parseCashInput, toCentavos } from "../utils/money";
import type { CartItem, CustomerInfo } from "../utils/receipt";
import { printSaleReceipt } from "../utils/receipt";

// ─── Polling constants ────────────────────────────────────────────────────────
const HEALTH_POLL_MS   = 15_000; // check server reachability every 15 s
const PENDING_POLL_MS  = 60_000; // refresh pending returns/voids every 60 s

// ─── Draft type ───────────────────────────────────────────────────────────────
interface CashierDraft {
  cartItems: CartItem[];
  cashTendered: string;
  customerInfo: CustomerInfo;
  selectedDiscount: { id: number; name: string; percentage: number; requiresApproval: boolean } | null;
  savedAt: string;
}

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

  // ── Draft recovery ────────────────────────────────────────────────────────
  const cartDraft = useDraftRecovery<CashierDraft>(DRAFT_KEYS.CASHIER_CART);
  const [recoverableDraft, setRecoverableDraft] = useState<CashierDraft | null>(null);

  // Check for a recoverable draft once on mount.
  useEffect(() => {
    const draft = cartDraft.getRecoverableDraft();
    if (draft && Array.isArray(draft.cartItems) && draft.cartItems.length > 0) {
      setRecoverableDraft(draft);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    store_name: "", facebook: "", contact_number: "", address: "",
    currency: "PHP", vat_rate: 0, business_license: "", registered_taxpayer_name: "",
    tin: "", document_type: "SALES INVOICE", pos_min: "", pos_serial: "", vat_registered: false,
    vat_enabled: false,
    proprietor: "",
    pricing_type: null,
    receipt_footer: null,
    printer_name: null,
    cash_drawer_enabled: false,
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
  const [cartItems, setCartItemsRaw]    = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeRef    = useRef<HTMLInputElement>(null);

  // Wraps the raw cart setter. When the cart is cleared to empty AND there is
  // a pending discount request, automatically cancel it on the server (Req-6).
  const discountRequestIdRef = useRef<number | null>(null);
  const setCartItems: typeof setCartItemsRaw = useCallback((value) => {
    setCartItemsRaw((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (next.length === 0 && prev.length > 0 && discountRequestIdRef.current) {
        const id = discountRequestIdRef.current;
        discountRequestIdRef.current = null;
        httpClient.delete(`/api/discount-approvals/${id}`).catch(() => {});
        // Reset client-side discount state in next tick to avoid mid-render setState
        setTimeout(() => {
          setSelectedDiscount(null);
          setDiscountRequestId(null);
        }, 0);
      }
      return next;
    });
  }, []);

  // ── Payment state ─────────────────────────────────────────────────────────
  const [cashTendered, setCashTendered]   = useState("");
  const [customerInfo, setCustomerInfo]   = useState<CustomerInfo>({ name: "", address: "", tin: "", businessStyle: "" });
  const [holdCounter, setHoldCounter]     = useState(0);
  const [showHolds, setShowHolds]         = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<{ id: number; name: string; percentage: number; requiresApproval: boolean } | null>(null);
  const [discountRequestId, setDiscountRequestId] = useState<number | null>(null);
  const [showDiscountApprovalModal, setShowDiscountApprovalModal] = useState(false);

  // Keep the ref in sync with state so the wrapped setCartItems can read it
  // without a stale closure.
  useEffect(() => { discountRequestIdRef.current = discountRequestId; }, [discountRequestId]);

  // ── Auto-save cart draft after every change ───────────────────────────────
  // Runs only when there is something worth saving (non-empty cart).
  // Cleared by commitDraft() on successful payment or discardDraft() on discard.
  useEffect(() => {
    if (cartItems.length > 0) {
      cartDraft.saveDraft({
        cartItems,
        cashTendered,
        customerInfo,
        selectedDiscount,
        savedAt: new Date().toISOString(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems, cashTendered, customerInfo, selectedDiscount]);

  // ── Void state ────────────────────────────────────────────────────────────
  const [showVoidDialog, setShowVoidDialog]         = useState(false);
  const [showVoidRequests, setShowVoidRequests]     = useState(false);
  const [latestVoidDecision, setLatestVoidDecision] = useState<VoidDecisionNotification | null>(null);
  const [pendingVoidRequestsCount, setPendingVoidRequestsCount] = useState(0);
  const [unreadVoidCount, setUnreadVoidCount] = useState(0);

  // ── End Shift modal ───────────────────────────────────────────────────────
  const [showEndShift, setShowEndShift]       = useState(false);
  const [hasOpenSession, setHasOpenSession]   = useState(false);
  const [sessionChecked, setSessionChecked]   = useState(false); // true once initial check completes

  // ── Suspended sales ───────────────────────────────────────────────────────
  const [suspendedSales, setSuspendedSales]     = useState<SuspendedSaleApi[]>([]);
  const [suspendedLoading, setSuspendedLoading] = useState(false);

  // ── Return state ──────────────────────────────────────────────────────────
  const [heldReturns, setHeldReturns]       = useState<HeldReturn[]>([]);
  const [showHeldReturns, setShowHeldReturns] = useState(false);
  const [showReturns, setShowReturns]         = useState(false);
  const [returnToProcessId, setReturnToProcessId] = useState<number | null>(null);

  // ── Calculations ──────────────────────────────────────────────────────────
  const totalCents    = cartItems.reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxRate       = storeSettings.vat_rate > 0 ? storeSettings.vat_rate : 12;
  const vatableCents  = cartItems.filter((i) => i.tax_type === "VATABLE").reduce((s, i) => s + toCentavos(i.subtotal), 0);
  const taxCents      = Math.round(vatableCents * taxRate / (100 + taxRate));
  const subtotalCents = totalCents - taxCents;
  
  // Calculate discount amount
  const discountCents = selectedDiscount 
    ? Math.round((totalCents * selectedDiscount.percentage) / 100)
    : 0;
  const finalTotalCents = totalCents - discountCents;
  
  const cashCents     = parseCashInput(cashTendered);
  const changeCents   = cashCents >= finalTotalCents ? cashCents - finalTotalCents : null;
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
      const newCount = voidsResult.value.length;
      setPendingVoidRequestsCount(newCount);
      // Only increment unread count if there are NEW void requests
      setUnreadVoidCount((prev) => Math.max(prev, newCount));
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
    // Increment unread count when a new decision arrives
    setUnreadVoidCount((prev) => prev + 1);
    if (n.decision === "approved")
      toast.success(`Void Approved — ${n.invoice_number}`, { description: `${fmt(n.total_amount)} · Approved by ${n.admin_name}. Inventory restored.`, duration: 10000 });
    else
      toast.error(`Void Rejected — ${n.invoice_number}`, { description: n.rejection_reason ?? `Rejected by ${n.admin_name}`, duration: 10000 });
    fetchPendingData();
  });

  // ── Cart helpers ──────────────────────────────────────────────────────────
  const clearCart = () => { setCartItems([]); setCashTendered(""); };

  const handleProcessReturn = (hr: HeldReturn) => {
    setShowHeldReturns(false);
    // The ReturnsPanel owns execution so only the server-approved resolution
    // and verified condition are displayed to the cashier.
    setReturnToProcessId(hr.returnId);
    setShowReturns(true);
  };

  // ── Suspended sales ───────────────────────────────────────────────────────
  const loadSuspendedSales = useCallback(async () => {
    setSuspendedLoading(true);
    try { const data = await getSuspendedSales(); setSuspendedSales(data); }
    catch { /* silent */ }
    setSuspendedLoading(false);
  }, []);
  useEffect(() => { loadSuspendedSales(); }, [loadSuspendedSales]);

  // ── Check for open shift session on mount ─────────────────────────────────
  // If no open session found, automatically prompt the cashier to start a shift.
  useEffect(() => {
    getMySession()
      .then((s) => {
        const isOpen = !!s;
        setHasOpenSession(isOpen);
        setSessionChecked(true);
        if (!isOpen) {
          // Small delay so the POS UI renders before the modal appears
          setTimeout(() => setShowEndShift(true), 600);
        }
      })
      .catch(() => {
        setHasOpenSession(false);
        setSessionChecked(true);
      });
  }, []);

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
        discount: selectedDiscount ?? null,
      });
      toast.success("Transaction suspended and saved.");
      loadSuspendedSales(); clearCart();
      setSelectedDiscount(null);
      setDiscountRequestId(null);
      setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });
    } catch (err: unknown) { toast.error(getErrorMessage(err, "Failed to suspend sale.")); }
  }, [cartItems, customerInfo, holdCounter, loadSuspendedSales, selectedDiscount]);

  const handleRecall = useCallback(async (holdId: string) => {
    const held = suspendedSales.find((h) => h.suspended_order_id === holdId);
    if (!held) return;
    setCartItems(held.cart_data.map(item => ({
      id: item.product_id, name: item.name, barcode: item.barcode,
      quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal,
      tax_type: item.tax_type || "VATABLE", tax_rate: item.tax_rate || taxRate,
      taxable_amount: item.taxable_amount || 0, vat_amount: item.vat_amount || 0,
    })));
    // Restore discount — a held transaction keeps its selected discount
    setSelectedDiscount(held.discount ?? null);
    setDiscountRequestId(null); // approval must be re-obtained after recall
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
  const handleDiscountApproved = (requestId: number) => {
    setDiscountRequestId(requestId);
    // Pass the requestId directly to avoid depending on React state having
    // flushed before handleProcessPayment reads discountRequestId.
    handleProcessPaymentWithRequest(requestId);
  };

  const handleDiscountRejected = () => {
    setSelectedDiscount(null);
    setDiscountRequestId(null);
  };

  // Core payment handler — accepts an optional override for discountRequestId
  // so it can be called immediately after approval without waiting for setState.
  const handleProcessPaymentWithRequest = async (overrideRequestId?: number) => {
    // Hard block — no shift session means no transactions
    if (!hasOpenSession) {
      toast.error("Start your shift before processing transactions.");
      setShowEndShift(true);
      return;
    }
    const effectiveDiscountRequestId = overrideRequestId ?? discountRequestId;
    if (cartItems.length === 0 || cashCents < finalTotalCents || !customerInfo.name.trim()) return;

    // Check if discount requires approval and we don't have one yet
    if (selectedDiscount && selectedDiscount.requiresApproval && !effectiveDiscountRequestId) {
      setShowDiscountApprovalModal(true);
      return;
    }

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
        discount_id: selectedDiscount?.id,
        discount_request_id: effectiveDiscountRequestId || undefined,
        items: cartItems.map((i) => ({ product_id: i.id, quantity: i.quantity, unit_price: Number(i.unitPrice), subtotal: Number(i.subtotal), tax_type: i.tax_type })),
      };
      const saleResult = await createSale(payload);

      const printedCartItems    = [...cartItems];
      const printedCustomerInfo = { ...customerInfo };
      // Snapshot discount info before state is cleared (used for receipt below)
      const printedDiscountCents      = discountCents;
      const printedDiscountName       = selectedDiscount?.name;
      const printedDiscountPercentage = selectedDiscount?.percentage;
      const printedFinalTotalCents    = finalTotalCents;
      // Clear discount state BEFORE clearing cart so the wrapped setCartItems
      // does not attempt to cancel an already-used or already-completed request.
      setSelectedDiscount(null);
      setDiscountRequestId(null);
      clearCart();
      setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "" });

      // ── Clear draft — transaction is now committed to the DB ──────────────
      cartDraft.commitDraft();

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
          discountCents: printedDiscountCents,
          discountName: printedDiscountName,
          discountPercentage: printedDiscountPercentage,
          finalTotalCents: printedFinalTotalCents,
        });
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

  const handleProcessPayment = () => handleProcessPaymentWithRequest();

  const today = new Date().toLocaleDateString("en-PH", { weekday: "short", year: "numeric", month: "short", day: "numeric" });

  // ── Draft recovery handlers ───────────────────────────────────────────────
  const handleRestoreDraft = () => {
    if (!recoverableDraft) return;
    setCartItems(recoverableDraft.cartItems);
    setCashTendered(recoverableDraft.cashTendered || "");
    setCustomerInfo(recoverableDraft.customerInfo || { name: "", address: "", tin: "", businessStyle: "" });
    setSelectedDiscount(recoverableDraft.selectedDiscount || null);
    setDiscountRequestId(null); // approval must be re-obtained
    setRecoverableDraft(null);
    toast.success("Draft restored — continue where you left off.");
  };

  const handleDiscardDraft = () => {
    cartDraft.discardDraft();
    setRecoverableDraft(null);
    toast.info("Draft discarded.");
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Draft recovery prompt */}
      <DraftRecoveryPrompt
        draft={recoverableDraft}
        formLabel="Shopping Cart"
        savedSummary={
          recoverableDraft
            ? `${recoverableDraft.cartItems.length} item(s)${recoverableDraft.customerInfo?.name ? ` · Customer: ${recoverableDraft.customerInfo.name}` : ""}${recoverableDraft.selectedDiscount ? ` · Discount: ${recoverableDraft.selectedDiscount.name}` : ""}${recoverableDraft.savedAt ? ` · Saved: ${new Date(recoverableDraft.savedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
            : undefined
        }
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
      />
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
              <DropdownMenuItem
                className="gap-2 text-amber-600 hover:text-amber-700 font-medium"
                onClick={() => setShowEndShift(true)}
              >
                <PowerOff className="h-4 w-4" />
                {hasOpenSession ? "End Shift" : "Start Shift"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600 gap-2" onClick={logout}>
                <LogOut className="h-4 w-4" />Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Offline banner ─────────────────────────────────────────────────── */}
      {isOffline && (
        <div className="shrink-0 bg-red-600 text-white text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2 z-10">
          <WifiOff className="h-4 w-4" />
          Server Unreachable — Transactions Unavailable. Waiting to reconnect…
        </div>
      )}

      {/* ── No-shift banner ────────────────────────────────────────────────── */}
      {/* Shown after session check completes and no open session exists.       */}
      {sessionChecked && !hasOpenSession && (
        <div className="shrink-0 bg-amber-500 text-white text-sm font-semibold text-center py-2 px-4 flex items-center justify-center gap-2 z-10">
          <PowerOff className="h-4 w-4" />
          No active shift — please start your shift before processing transactions.
          <button
            onClick={() => setShowEndShift(true)}
            className="ml-2 underline underline-offset-2 hover:text-amber-100 transition-colors font-bold"
          >
            Start Shift
          </button>
        </div>
      )}

      {/* Main POS area */}
      <div className="flex-1 flex gap-3 p-3 overflow-hidden min-h-0">
        <CartPanel
          cartItems={cartItems}
          setCartItems={setCartItems}
          barcodeInput={barcodeInput}
          setBarcodeInput={setBarcodeInput}
          searchResults={searchResults}
          setSearchResults={setSearchResults}
          searchLoading={searchLoading}
          setSearchLoading={setSearchLoading}
          showDropdown={showDropdown}
          setShowDropdown={setShowDropdown}
          barcodeRef={barcodeRef}
          searchTimeoutRef={searchTimeout}
          selectedDiscount={selectedDiscount}
          setSelectedDiscount={setSelectedDiscount}
          noShift={sessionChecked && !hasOpenSession}
        />
        <CustomerPanel customerInfo={customerInfo} setCustomerInfo={setCustomerInfo} />
        <PaymentPanel
          subtotalCents={subtotalCents} taxCents={taxCents}
          totalCents={totalCents} taxRate={taxRate}
          cashTendered={cashTendered} setCashTendered={setCashTendered}
          cartLength={cartItems.length} customerName={customerInfo.name}
          isProcessing={isProcessing} isOffline={isOffline}
          noShift={sessionChecked && !hasOpenSession}
          pendingApproval={showDiscountApprovalModal}
          onProcessPayment={handleProcessPayment}
          onHold={handleHold}
          onHoldOrders={() => setShowHolds(true)}
          discountCents={discountCents}
          discountName={selectedDiscount?.name}
          discountPercentage={selectedDiscount?.percentage}
          finalTotalCents={finalTotalCents}
          onReturn={() => setShowReturns(true)}
          onPendingReturns={() => setShowHeldReturns(true)}
          onVoid={() => setShowVoidDialog(true)}
          onVoidRequests={() => setShowVoidRequests(true)}
          pendingReturnsCount={heldReturns.length}
          hasApprovedReturns={heldReturns.some(
            (r) => r.decision === "waiting_for_cashier" || r.decision === "approved"
          )}
          pendingVoidRequestsCount={unreadVoidCount}
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
        onReturnResolved={(returnId: number) => {
          setHeldReturns((prev) => prev.filter((r) => r.returnId !== returnId));
        }}
        existingHeldReturns={heldReturns}
        returnToProcessId={returnToProcessId}
        onReturnToProcessHandled={() => setReturnToProcessId(null)}
      />
      <CashierVoidRequestsPanel
        show={showVoidRequests} onClose={() => setShowVoidRequests(false)}
        newDecision={latestVoidDecision}
        onRequestVoid={() => setShowVoidDialog(true)}
        onViewed={() => setUnreadVoidCount(0)}
      />
      <VoidSaleDialog open={showVoidDialog} onClose={() => setShowVoidDialog(false)} />
      <DiscountApprovalModal
        open={showDiscountApprovalModal}
        onClose={() => setShowDiscountApprovalModal(false)}
        discount={selectedDiscount}
        totalAmount={totalCents}
        onApproved={handleDiscountApproved}
        onRejected={handleDiscountRejected}
      />

      <EndShiftModal
        open={showEndShift}
        onClose={() => setShowEndShift(false)}
        onShiftOpened={() => setHasOpenSession(true)}
        onShiftClosed={() => setHasOpenSession(false)}
      />

    </div>
  );
}
