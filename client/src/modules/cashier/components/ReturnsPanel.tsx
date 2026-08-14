import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getMyReturnHistory, getReturnById, resolveReturn, type Return as ReturnFull } from "@/shared/api/returnsApi";
import { getSaleByInvoice, searchSales, type Sale, type SaleSummary } from "@/shared/api/salesApi";
import { type StoreSettings } from "@/shared/api/settingsApi";
import { useAuth } from "@/shared/contexts/AuthContext";
import { printReturnReceipt } from "@/shared/utils/returnReceiptPrinter";
import { CheckCircle, Hourglass, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { HeldReturn } from "./PendingReturnsPanel";
import ReturnAuthModal from "./ReturnAuthModal";

interface ReturnsPanelProps {
  show: boolean;
  onClose: () => void;
  storeSettings: StoreSettings;
  onHeldReturn: (hr: HeldReturn) => void;
  onReturnResolved?: (returnId: number) => void;
  existingHeldReturns?: HeldReturn[];
  returnToProcessId?: number | null;
  onReturnToProcessHandled?: () => void;
}

interface SelectedItem {
  checked: boolean;
  quantity: number;
  reason: string;
  scannedBarcode: string;
  barcodeConfirmed: boolean;
}

export default function ReturnsPanel({ show, onClose, storeSettings, onHeldReturn, onReturnResolved, existingHeldReturns = [], returnToProcessId, onReturnToProcessHandled }: ReturnsPanelProps) {
  const { user } = useAuth();
  const [searchMode, setSearchMode] = useState<"search" | "date" | "history">("history");
  const [unifiedSearch, setUnifiedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [blendedSearch, setBlendedSearch] = useState("");
  const [saleSearchResults, setSaleSearchResults] = useState<SaleSummary[]>([]);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnLookupError, setReturnLookupError] = useState<string | null>(null);
  const [returnLookupLoading, setReturnLookupLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<number, SelectedItem>>({});
  const [returnSubmitError, setReturnSubmitError] = useState<string | null>(null);
  const [returnSubmitLoading, setReturnSubmitLoading] = useState(false);
  const [submittedReturn, setSubmittedReturn] = useState<{ return_number: string; id: number } | null>(null);
  const [showResolution, setShowResolution] = useState(false);
  const [resolveData, setResolveData] = useState<ReturnFull | null>(null);
  const [itemCondition, setItemCondition] = useState<"good" | "damaged" | "defective">("good");
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [returnHistory, setReturnHistory] = useState<ReturnFull[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Auth modal state — shown after return is created
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingReturnPayload, setPendingReturnPayload] = useState<any>(null);
  const [pendingInvoiceNumber, setPendingInvoiceNumber] = useState("");
  const [pendingCustomerName, setPendingCustomerName] = useState("");

  // Load return history when panel opens
  useEffect(() => {
    if (show && searchMode === "history") {
      loadReturnHistory();
    }
  }, [show, searchMode]);

  const loadReturnHistory = async () => {
    setHistoryLoading(true);
    try {
      const history = await getMyReturnHistory(blendedSearch || undefined);
      setReturnHistory(history);
    } catch {
      toast.error("Failed to load return history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const resetPanel = () => {
    setUnifiedSearch(""); setDateFrom(""); setDateTo("");
    setSaleSearchResults([]); setReturnSale(null); setReturnLookupError(null);
    setSelectedItems({}); setSubmittedReturn(null); setReturnSubmitError(null);
  };

  const handleUnifiedSearch = async () => {
    if (!unifiedSearch.trim()) return;
    setReturnLookupLoading(true); setReturnLookupError(null); setSaleSearchResults([]);
    try {
      // First try as invoice lookup (check if it looks like an invoice)
      if (unifiedSearch.trim().toUpperCase().startsWith("INV-")) {
        try {
          const sale = await getSaleByInvoice(unifiedSearch.trim());
          if (sale.void_status === "voided") {
            setReturnLookupError("This sale has been voided and cannot be returned.");
            return;
          }
          setReturnSale(sale);
          const init: Record<number, SelectedItem> = {};
          sale.items.forEach((item) => {
            const remaining = item.quantity - item.quantity_returned;
            if (remaining > 0 && item.is_returnable) {
              init[item.id] = { checked: false, quantity: 1, reason: "Damaged", scannedBarcode: "", barcodeConfirmed: !item.barcode };
            }
          });
          setSelectedItems(init);
        } catch (invoiceErr) {
          setReturnLookupError("Invoice not found.");
        }
      } else {
        // Otherwise search by customer name (exclude sales with completed returns)
        const results = await searchSales({ customer_name: unifiedSearch.trim(), return_status: "no_returns" });
        const active = results.filter((s) => s.void_status !== "voided");
        if (active.length === 0) {
          setReturnLookupError("No transactions found.");
        } else {
          setSaleSearchResults(active);
        }
      }
    } catch { setReturnLookupError("Search failed."); }
    finally { setReturnLookupLoading(false); }
  };

  const handleSaleSearch = async () => {
    setReturnLookupLoading(true); setReturnLookupError(null); setSaleSearchResults([]);
    try {
      const results = await searchSales({ date_from: dateFrom || undefined, date_to: dateTo || undefined, return_status: "no_returns" });
      const active = results.filter((s) => s.void_status !== "voided");
      if (active.length === 0) setReturnLookupError("No transactions found.");
      else setSaleSearchResults(active);
    } catch { setReturnLookupError("Search failed."); }
    finally { setReturnLookupLoading(false); }
  };

  const handleReturnSubmit = async () => {
    if (!returnSale) return;
    const itemsToReturn = Object.entries(selectedItems).filter(([, v]) => v.checked).map(([idStr, v]) => {
      const saleItemId = Number(idStr);
      const saleItem = returnSale.items.find((i) => i.id === saleItemId)!;
      return { sale_item_id: saleItemId, product_id: saleItem.product_id, quantity_returned: v.quantity, unit_price: saleItem.unit_price, _reason: v.reason };
    });
    if (itemsToReturn.length === 0) { setReturnSubmitError("Select at least one item."); return; }

    // Don't create the return request yet — just capture the payload and show the auth modal
    // The request will only be created when the cashier picks a method
    setPendingReturnPayload({
      sale_id: Number(returnSale.id),
      return_reason: itemsToReturn[0]._reason,
      item_condition: itemCondition,
      items: itemsToReturn.map(({ sale_item_id, product_id, quantity_returned, unit_price }) => ({
        sale_item_id: Number(sale_item_id),
        product_id: Number(product_id),
        quantity_returned,
        unit_price,
      })),
    });
    setPendingInvoiceNumber(returnSale.invoice_number);
    setPendingCustomerName(returnSale.customer_name);
    setShowAuthModal(true);
  };

  const handleFetchForResolution = async (returnId: number) => {
    try {
      const ret = await getReturnById(returnId);
      if (ret.status !== "waiting_for_cashier") {
        toast.error("Not approved yet.");
        return;
      }
      setResolveData(ret); setResolveError(null); setShowResolution(true);
    } catch {
      toast.error("Failed to fetch return details.");
    }
  };

  // Preserve the Pending Returns panel's direct “Process Now” behavior while
  // routing execution through this read-only approval dialog.
  useEffect(() => {
    if (!show || !returnToProcessId) return;
    void handleFetchForResolution(returnToProcessId);
    onReturnToProcessHandled?.();
  }, [show, returnToProcessId]);

  const handleResolve = async () => {
    if (!resolveData) return;
    setResolveLoading(true); setResolveError(null);
    try {
      const resolved = await resolveReturn(resolveData.id, {});
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
          unit_price: i.unit_price
        })),
        resolved_at: resolved.resolved_at ?? undefined,
        settings: storeSettings,
        exchange_barcode: resolved.exchange_barcode ?? undefined,
        exchange_quantity: resolved.exchange_quantity ?? undefined,
        additional_payment: resolved.additional_payment ?? undefined,
        refund_difference: resolved.refund_difference ?? undefined
      });
      toast.success("Return completed.");
      // Notify parent to update pending returns
      if (onReturnResolved) {
        onReturnResolved(resolved.id);
      }
      setShowResolution(false); setResolveData(null); setSubmittedReturn(null); resetPanel(); onClose();
    } catch (err: any) { setResolveError(err?.response?.data?.message ?? "Failed to process."); }
    finally { setResolveLoading(false); }
  };

  const handleReturnApproved = () => {
    setShowAuthModal(false);
    // After approval, user can process the return or park it
    toast.success("Return approved! You can now process it.");
  };

  useEffect(() => {
    if (!show) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if an auth modal or dialog is open
      if (showAuthModal) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        resetPanel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [show, showAuthModal, onClose]);

  return (
    <>
      {show && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { onClose(); resetPanel(); }} />}
      <div data-drawer="true" className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${show ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-blue-500" /><h2 className="text-base font-bold text-gray-900">Process Return</h2></div>
          <button onClick={() => { onClose(); resetPanel(); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!returnSale && !submittedReturn && (
            <div className="space-y-3">
              {/* Pending Returns Section */}
              {existingHeldReturns.length > 0 && (
                <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-3 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Hourglass className="h-4 w-4 text-purple-600" />
                    <h3 className="text-sm font-semibold text-purple-900">Pending Returns</h3>
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-xs">{existingHeldReturns.length}</span>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {existingHeldReturns.map((hr) => (
                      <button
                        key={hr.id}
                        onClick={() => handleFetchForResolution(hr.returnId)}
                        className="w-full text-left px-2 py-2 bg-white border-2 border-purple-200 rounded hover:bg-purple-100 transition-colors"
                      >
                        <p className="text-xs font-semibold text-purple-900">{hr.returnNumber}</p>
                        <p className="text-xs text-gray-500">{hr.invoiceNumber} · {hr.customerName}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex rounded-lg border-2 border-gray-300 overflow-hidden text-xs font-semibold shadow-sm">
                {(["search", "date", "history"] as const).map((m) => (
                  <button key={m} onClick={() => { setSearchMode(m); setReturnLookupError(null); setSaleSearchResults([]); if (m === "history") loadReturnHistory(); }} className={`flex-1 py-2 ${searchMode === m ? "bg-blue-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>{m === "search" ? "Search" : m === "date" ? "Date" : "History"}</button>
                ))}
              </div>
              {searchMode === "search" && (
                <div className="flex gap-2">
                  <Input
                    value={unifiedSearch}
                    onChange={(e) => setUnifiedSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUnifiedSearch()}
                    placeholder="Search Invoice # or Customer..."
                    className="h-10 text-sm flex-1 border-2 border-gray-300"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={handleUnifiedSearch}
                    disabled={returnLookupLoading || !unifiedSearch.trim()}
                  >
                    {returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
                  </Button>
                </div>
              )}
              {searchMode === "date" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs mb-0.5 block">From</label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="h-10 text-sm border-2 border-gray-300"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs mb-0.5 block">To</label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-10 text-sm border-2 border-gray-300"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaleSearch}
                    disabled={returnLookupLoading || (!dateFrom && !dateTo)}
                    className="h-9 w-full"
                  >
                    {returnLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
                  </Button>
                </div>
              )}
              {searchMode === "history" && (
                <div className="flex gap-2">
                  <Input
                    value={blendedSearch}
                    onChange={(e) => setBlendedSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loadReturnHistory()}
                    placeholder="Search Invoice # or Customer..."
                    className="h-10 text-sm flex-1 border-2 border-gray-300"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={loadReturnHistory}
                    disabled={historyLoading}
                  >
                    {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
                  </Button>
                </div>
              )}
              {returnLookupError && <p className="text-xs text-red-600">{returnLookupError}</p>}
              {searchMode === "history" && (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {historyLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : returnHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No return history found
                    </div>
                  ) : (
                    returnHistory.map((ret) => (
                      <div
                        key={ret.id}
                        className={`border-2 rounded-lg p-3 shadow-sm ${
                          ret.status === "waiting_for_cashier" ? "bg-green-50 border-green-200" :
                          ret.status === "completed" ? "bg-blue-50 border-blue-200" :
                          ret.status === "rejected" ? "bg-red-50 border-red-200" :
                          "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold font-mono text-gray-900">{ret.return_number}</p>
                              {ret.status === "waiting_for_cashier" ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : ret.status === "completed" ? (
                                <CheckCircle className="h-4 w-4 text-blue-600" />
                              ) : ret.status === "rejected" ? (
                                <XCircle className="h-4 w-4 text-red-600" />
                              ) : null}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">Invoice: {ret.invoice_number}</p>
                            <p className="text-xs text-gray-500">Customer: {ret.customer_name}</p>
                            {ret.admin_name && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {ret.status === "waiting_for_cashier" ? "Approved" : ret.status === "completed" ? "Completed" : "Rejected"} by {ret.admin_name}
                              </p>
                            )}
                            {ret.status === "rejected" && ret.return_reason && (
                              <p className="text-xs text-red-600 bg-red-100 rounded px-2 py-1 mt-2">
                                Reason: {ret.return_reason}
                              </p>
                            )}
                          </div>
                          {ret.status === "waiting_for_cashier" && !ret.resolved_at && (
                            <Button
                              size="sm"
                              className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                              onClick={() => handleFetchForResolution(ret.id)}
                            >
                              Process
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
              </div>
              )}
              {saleSearchResults.length > 0 && (
                <div className="border-2 border-gray-300 rounded-lg overflow-hidden max-h-56 overflow-y-auto shadow-sm">
                  {saleSearchResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSaleSearchResults([]);
                        setUnifiedSearch(s.invoice_number);
                        setReturnLookupLoading(true);
                        setReturnLookupError(null);
                        getSaleByInvoice(s.invoice_number)
                          .then((sale) => {
                            setReturnSale(sale);
                            const init: Record<number, SelectedItem> = {};
                            sale.items.forEach((item) => {
                              const rem = item.quantity - item.quantity_returned;
                              if (rem > 0 && item.is_returnable) {
                                init[item.id] = {
                                  checked: false,
                                  quantity: 1,
                                  reason: "Damaged",
                                  scannedBarcode: "",
                                  barcodeConfirmed: !item.barcode
                                };
                              }
                            });
                            setSelectedItems(init);
                          })
                          .catch((err: any) =>
                            setReturnLookupError(
                              err?.response?.status === 404 ? "Not found." : err?.response?.data?.message
                            )
                          )
                          .finally(() => setReturnLookupLoading(false));
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 text-left border-b border-gray-200 last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{s.invoice_number}</p>
                        <p className="text-xs text-gray-500">{s.customer_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-blue-600">
                          ₱{Number(s.total_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString()}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {returnSale && !submittedReturn && (
            <div className="space-y-4">
              <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-3 text-sm space-y-1 shadow-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice</span>
                  <span className="font-semibold">{returnSale.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium">{returnSale.customer_name}</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Item Condition</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {(["good", "damaged", "defective"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setItemCondition(opt)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium ${
                        itemCondition === opt ? "border-blue-500 bg-blue-50" : "border-gray-200"
                      }`}
                    >
                      {opt === "good" ? "✅ Good" : opt === "damaged" ? "⚠️ Damaged" : "🔧 Defective"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Select Items</p>
                <div className="space-y-2">
                  {returnSale.items
                    .filter((item) => {
                      const rem = item.quantity - item.quantity_returned;
                      return rem > 0 && item.is_returnable;
                    })
                    .map((item) => {
                      const sel = selectedItems[item.id];
                      if (!sel) return null;
                      const rem = item.quantity - item.quantity_returned;
                      return (
                        <div
                          key={item.id}
                          className={`border-2 rounded-lg p-3 shadow-sm ${
                            sel.checked ? "border-blue-400 bg-blue-50/40" : "border-gray-300 bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={sel.checked}
                              onChange={(e) =>
                                setSelectedItems((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], checked: e.target.checked },
                                }))
                              }
                              className="mt-0.5 h-4 w-4 accent-blue-600"
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.product_name}</p>
                              <p className="text-xs text-gray-500">
                                Ret: {rem} · ₱{Number(item.unit_price).toFixed(2)}
                              </p>
                            </div>
                          </div>
                          {sel.checked && (
                            <div className="pl-6 flex gap-2 mt-2">
                              <div className="flex-1">
                                <label className="text-xs mb-0.5 block">Qty</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={rem}
                                  value={sel.quantity}
                                  onChange={(e) =>
                                    setSelectedItems((prev) => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        quantity: Math.min(rem, Math.max(1, Number(e.target.value))),
                                      },
                                    }))
                                  }
                                  className="w-full h-9 text-sm border-2 border-gray-300 rounded px-2"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs mb-0.5 block">Reason</label>
                                <select
                                  value={sel.reason}
                                  onChange={(e) =>
                                    setSelectedItems((prev) => ({
                                      ...prev,
                                      [item.id]: { ...prev[item.id], reason: e.target.value },
                                    }))
                                  }
                                  className="w-full h-9 text-sm border-2 border-gray-300 rounded px-2"
                                >
                                  <option value="Damaged">Damaged</option>
                                  <option value="Missing Items">Missing Items</option>
                                  <option value="Wrong Item">Wrong Item</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handleReturnSubmit}
                disabled={returnSubmitLoading || Object.values(selectedItems).filter((v) => v.checked).length === 0}
              >
                {returnSubmitLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit Return Request
              </Button>
            </div>
          )}
          {submittedReturn && (
            <div className="space-y-4">
              <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 text-center shadow-sm">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <RotateCcw className="h-5 w-5 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-green-800 mt-2">Return Submitted</p>
                <p className="text-xs font-mono text-green-700 bg-green-100 rounded px-2 py-1 mt-1">
                  {submittedReturn.return_number}
                </p>
                <p className="text-xs text-green-700 mt-1">Approval requested — check your pending returns list.</p>
              </div>
              <Button className="w-full" onClick={() => handleFetchForResolution(submittedReturn.id)}>
                Process Return
              </Button>
              <Button
                variant="outline"
                className="w-full border-2 border-gray-300"
                onClick={() => {
                  onHeldReturn({
                    id: `hret-${Date.now()}`,
                    heldAt: new Date(),
                    returnId: submittedReturn.id,
                    returnNumber: submittedReturn.return_number,
                    invoiceNumber: returnSale?.invoice_number ?? "",
                    customerName: returnSale?.customer_name ?? "",
                  });
                  onClose();
                  resetPanel();
                  toast.success("Return parked.");
                }}
              >
                <Hourglass className="h-4 w-4 mr-2" /> Serve Next Customer
              </Button>
              <Button variant="outline" className="w-full h-9 text-xs" onClick={resetPanel}>
                Start New Return
              </Button>
            </div>
          )}
        </div>
      </div>
      <Dialog open={showResolution} onOpenChange={(o) => { if (!o) { setShowResolution(false); setResolveData(null); setResolveError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Process Return</DialogTitle>
          </DialogHeader>
          {resolveData && (
            <div className="space-y-4">
              <div className="text-xs text-gray-500">
                <p>Return: <span className="font-mono font-semibold">{resolveData.return_number}</span></p>
                <p>Invoice: <span className="font-semibold">{resolveData.invoice_number}</span></p>
              </div>
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-900 mb-1">Approved Resolution</p>
                <p className="text-sm font-bold text-blue-700 capitalize">
                  {resolveData.resolution === "refund" ? "💰 Refund" : resolveData.resolution === "exchange" ? "🔄 Exchange" : resolveData.resolution === "store_credit" ? "💳 Store Credit" : "❌ Rejected"}
                </p>
              </div>
              {resolveData.resolution === "exchange" && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-900 mb-1">Exchange Details</p>
                  <p className="text-xs text-amber-700">Barcode: {resolveData.exchange_barcode ?? "Not available"}</p>
                  <p className="text-xs text-amber-700">Quantity: {resolveData.exchange_quantity ?? "Not available"}</p>
                </div>
              )}
              <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-900 mb-1">Item Condition</p>
                <p className="text-sm font-medium text-gray-700 capitalize">{resolveData.item_condition ?? "Not recorded"}</p>
              </div>
              {resolveError && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{resolveError}</p>}
              <Button className="w-full" onClick={handleResolve} disabled={resolveLoading}>
                {resolveLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Execute {resolveData.resolution === "refund" ? "Refund" : resolveData.resolution === "exchange" ? "Exchange" : resolveData.resolution === "store_credit" ? "Store Credit" : "Resolution"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Auth modal — shown immediately after a return is submitted */}
      <ReturnAuthModal
        open={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          // Auth closed without completion — reset everything
          resetPanel();
        }}
        returnPayload={pendingReturnPayload}
        invoiceNumber={pendingInvoiceNumber}
        customerName={pendingCustomerName}
        onApproved={handleReturnApproved}
      />
    </>
  );
}
