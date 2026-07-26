import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  TrendingUp, History, RefreshCw, AlertCircle, X, Edit2, Clock,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import {
  getCommodityProducts, getPriceHistory, setPrice,
  getPurchaseHistory, getPendingCommodityPurchases,
  approveCommodityPurchase, rejectCommodityPurchase,
  type CommodityProduct, type CommodityPriceRecord, type CommodityPurchase,
} from "@/shared/api/commodityApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtShort(n: number | null | undefined) {
  if (n == null) return "—";
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateOnly(d: string) {
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
}

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (body?.errors?.[0]?.message) return body.errors[0].message;
    if (body?.message) return body.message;
  }
  return "An unexpected error occurred.";
}

// ─── Pending Approvals Section ───────────────────────────────────────────────

function PendingApprovalsSection({ refreshKey, onRefresh }: { refreshKey: number; onRefresh: () => void }) {
  const [purchases, setPurchases] = useState<CommodityPurchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);
  const [showApproveModal, setShowApproveModal] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPendingCommodityPurchases();
      setPurchases(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleApprove = async () => {
    if (!showApproveModal) return;
    setApprovingId(showApproveModal);
    try {
      const result = await approveCommodityPurchase(showApproveModal);
      toast.success(`Approved! Inventory updated to ${result.new_stock_quantity}`);
      setShowApproveModal(null);
      onRefresh();
      load();
    } catch (err: unknown) {
      toast.error(extractError(err));
      setShowApproveModal(null);
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async () => {
    if (!showRejectModal || !rejectReason.trim()) return;
    setRejectingId(showRejectModal);
    try {
      await rejectCommodityPurchase(showRejectModal, rejectReason.trim());
      toast.success("Purchase rejected.");
      setShowRejectModal(null);
      setRejectReason("");
      onRefresh();
      load();
    } catch (err: unknown) {
      toast.error(extractError(err));
    } finally {
      setRejectingId(null);
    }
  };

  const pendingCount = purchases.length;

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-amber-50">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-bold text-gray-900">Pending Approvals</h2>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-600 text-white text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </div>
          <button
            onClick={load}
            className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
            <Spinner className="text-amber-500" /> Loading…
          </div>
        ) : purchases.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No pending approvals.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-amber-100 text-amber-800">
                  {["Date", "Product", "Seller", "Qty Received", "Deducted", "Payable", "Ref. Price", "Gross", "Deduction", "Final Amount", "Submitted By", "Actions"].map((h) => (
                    <th key={h} className="py-3 px-3 font-semibold text-xs uppercase tracking-wide text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="py-3 px-3 whitespace-nowrap text-xs text-gray-600">{fmtDateOnly(p.transaction_date)}</td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-gray-900 text-sm">{p.product_name}</p>
                      <p className="font-mono text-xs text-gray-400">{p.barcode}</p>
                    </td>
                    <td className="py-3 px-3 text-xs text-gray-600">{p.seller || "—"}</td>
                    <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums">
                      {Number(p.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {p.unit_name}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-xs text-red-600">
                      {Number(p.deducted_quantity) > 0
                        ? <span className="text-red-600">−{Number(p.deducted_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums text-xs">
                      {Number(p.payable_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-600 tabular-nums text-xs">{fmtShort(p.reference_price)}</td>
                    <td className="py-3 px-3 text-right text-gray-600 tabular-nums text-xs">{fmt(p.gross_amount)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-xs">
                      {Number(p.deduction_amount) > 0
                        ? <span className="text-red-600">−{fmt(p.deduction_amount)}</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-700 tabular-nums">{fmt(p.final_amount)}</td>
                    <td className="py-3 px-3 text-xs text-gray-500">{p.prepared_by_name || "—"}</td>
                    <td className="py-3 px-3">
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => setShowApproveModal(p.id)}
                          disabled={approvingId !== null}
                        >
                          {approvingId === p.id ? "Processing..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setShowRejectModal(p.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Confirmation Modal */}
      <Dialog open={!!showApproveModal} onOpenChange={(o) => { if (!o) setShowApproveModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <TrendingUp className="h-5 w-5" />
              Approve Purchase
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800 font-medium">
                ⚠️ Inventory has not been updated yet. Approval will add the received quantity to inventory.
              </p>
            </div>
            <p className="text-sm text-gray-600">
              Are you sure you want to approve this commodity purchase? The approved quantity will be added to inventory.
            </p>
            {showApproveModal && purchases.find(p => p.id === showApproveModal) && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                <p className="font-semibold text-gray-900">
                  {purchases.find(p => p.id === showApproveModal)?.product_name}
                </p>
                <p className="text-gray-500 text-xs mt-1">
                  Seller: {purchases.find(p => p.id === showApproveModal)?.seller || "—"} · 
                  Qty: {Number(purchases.find(p => p.id === showApproveModal)?.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {purchases.find(p => p.id === showApproveModal)?.unit_name}
                </p>
                <p className="font-bold text-amber-700 mt-2">
                  Final Amount: {fmt(purchases.find(p => p.id === showApproveModal)?.final_amount)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveModal(null)} disabled={approvingId !== null}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approvingId !== null}
              className="bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {approvingId !== null && <Spinner className="text-white" />}
              {approvingId !== null ? "Approving..." : "Confirm Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={!!showRejectModal} onOpenChange={(o) => { if (!o) { setShowRejectModal(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Purchase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Please provide a reason for rejecting this purchase request.
            </p>
            <div>
              <Label>Rejection Reason <span className="text-red-500">*</span></Label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Invalid quantity, wrong product, etc."
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-1"
              />
            </div>
            {rejectReason.trim() === "" && (
              <p className="text-xs text-red-500">Rejection reason is required.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRejectModal(null); setRejectReason(""); }}>Cancel</Button>
            <Button
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejectingId !== null}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {rejectingId !== null ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Set Price Modal ──────────────────────────────────────────────────────────

interface SetPriceModalProps {
  product: CommodityProduct | null;
  onClose: () => void;
  onSaved: () => void;
}

function SetPriceModal({ product, onClose, onSaved }: SetPriceModalProps) {
  const [price,   setPrice_]  = useState("");
  const [reason,  setReason]  = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setPrice_(product.current_price != null ? String(product.current_price) : "");
      setReason("");
      setError(null);
    }
  }, [product?.id]);

  const handleSave = async () => {
    if (!product) return;
    const val = parseFloat(price);
    if (isNaN(val) || val <= 0) { setError("Price must be greater than 0."); return; }
    setSaving(true);
    setError(null);
    try {
      await setPrice(product.id, { price_per_unit: val, reason: reason.trim() || null });
      onSaved();
      onClose();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            Update Buying Price
          </DialogTitle>
        </DialogHeader>

        {product && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="font-semibold text-gray-900">{product.product_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Unit: {product.unit} ({product.unit_abbreviation})
                {product.current_price != null && (
                  <> · Current: <span className="font-semibold text-amber-700">{fmtShort(product.current_price)}/{product.unit_abbreviation}</span></>
                )}
              </p>
            </div>

            <div>
              <Label className="mb-1.5 block font-semibold text-sm">
                New Buying Price (₱ per {product.unit_abbreviation}) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number" min="0.0001" step="0.01"
                value={price}
                onChange={(e) => setPrice_(e.target.value)}
                placeholder="e.g. 40.00"
                className="h-10"
                autoFocus
              />
            </div>

            <div>
              <Label className="mb-1.5 block font-semibold text-sm">
                Reason for Change <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Market price increase, new supplier rate…"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <strong>Historical transactions are not affected.</strong> Only new purchases will use this price.
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
            {saving && <Spinner className="text-white" />}
            {saving ? "Saving…" : "Save Price"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Price History Panel ──────────────────────────────────────────────────────

function PriceHistoryPanel({ productId, productName, unitAbbr, onClose }: {
  productId: number;
  productName: string;
  unitAbbr: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<CommodityPriceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPriceHistory(productId)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" />
            Price History — {productName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-gray-400 flex items-center justify-center gap-2">
            <Spinner className="text-blue-500" /> Loading…
          </div>
        ) : history.length === 0 ? (
          <p className="py-8 text-center text-gray-400 text-sm">No price history yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h, idx) => (
              <div key={h.id} className={`p-3 rounded-lg border ${idx === 0 ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-lg font-bold tabular-nums ${idx === 0 ? "text-amber-700" : "text-gray-700"}`}>
                    {fmtShort(h.price_per_unit)}/{unitAbbr}
                  </span>
                  {idx === 0 && (
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {fmtDate(h.effective_from)} · by {h.changed_by_name}
                </p>
                {h.reason && (
                  <p className="text-xs text-gray-600 mt-1 italic">"{h.reason}"</p>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TabType = "products" | "history";

// ─── Market-Based Products + Purchase History Panel (with Tabs) ─────────────

function MarketBasedWithTabs({ 
  refreshKey, 
  onEditPrice, 
  onViewHistory 
}: { 
  refreshKey: number; 
  onEditPrice: (product: CommodityProduct) => void;
  onViewHistory: (product: CommodityProduct) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabType>("products");
  const [products, setProducts] = useState<CommodityProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<CommodityPurchase[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      setProducts(await getCommodityProducts());
    } catch (err) {
      setProductsError(extractError(err));
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await getPurchaseHistory({ date_from: dateFrom || undefined, date_to: dateTo || undefined, limit: 100 });
      setPurchases(data);
    } catch {
      /* silent */
    } finally {
      setHistoryLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadProducts(); }, [loadProducts, refreshKey]);
  useEffect(() => { if (activeTab === "history") loadHistory(); }, [activeTab, loadHistory, refreshKey]);

  const TabButton = ({ tab, icon: Icon, label }: { tab: TabType; icon: React.ElementType; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
        activeTab === tab
          ? tab === "products"
            ? "border-amber-500 text-amber-800 bg-white"
            : "border-blue-500 text-blue-800 bg-white"
          : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      <Icon className={`h-4 w-4 ${activeTab === tab ? (tab === "products" ? "text-amber-600" : "text-blue-600") : "text-gray-400"}`} />
      {label}
      {tab === "history" && purchases.length > 0 && (
        <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded text-gray-600">{purchases.length}</span>
      )}
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center border-b border-gray-200 bg-gray-50">
        <TabButton tab="products" icon={TrendingUp} label="Market-Based Products" />
        <TabButton tab="history" icon={History} label="Purchase History" />
        <div className="ml-auto px-3">
          <button
            onClick={() => activeTab === "products" ? loadProducts() : loadHistory()}
            className="h-8 w-8 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${(productsLoading || historyLoading) ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Products Tab */}
      {activeTab === "products" && (
        productsError ? (
          <div className="p-4 text-center">
            <p className="text-sm text-red-600 mb-2">{productsError}</p>
            <Button size="sm" variant="outline" onClick={loadProducts}>Retry</Button>
          </div>
        ) : productsLoading ? (
          <div className="py-16 text-center text-gray-400 flex items-center justify-center gap-2">
            <Spinner className="text-amber-500" /> Loading…
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingUp className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="font-semibold text-gray-600">No market-based products configured</p>
            <p className="text-xs text-gray-400 mt-1">
              Go to Products, edit a product, and set its Pricing Type to "Market-Based".
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-white">
                  {["Product", "Unit", "Current Buying Price", "Effective From", "Stock", "Actions"].map((h, i) => (
                    <th key={h} className={`py-3 px-5 font-semibold text-xs uppercase tracking-wide ${i >= 2 && i <= 4 ? "text-right" : i === 5 ? "text-center" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-gray-900">{p.product_name}</p>
                      <p className="font-mono text-xs text-gray-400 mt-0.5">{p.barcode}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">
                        {p.unit} ({p.unit_abbreviation})
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {p.current_price != null ? (
                        <span className="text-base font-bold text-amber-700 tabular-nums">
                          {fmtShort(p.current_price)}/{p.unit_abbreviation}
                        </span>
                      ) : (
                        <span className="text-xs text-red-500 font-semibold">Not set</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right text-xs text-gray-500">
                      {p.price_effective_from ? fmtDate(p.price_effective_from) : "—"}
                    </td>
                    <td className="py-3.5 px-5 text-right font-bold text-gray-900 tabular-nums">
                      {Number(p.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title="Update price"
                          onClick={() => onEditPrice(p)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          title="Price history"
                          onClick={() => onViewHistory(p)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <History className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <>
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-3 items-end bg-blue-50/50">
            <div>
              <Label className="text-xs font-semibold text-gray-500 mb-1 block">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm w-36" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-500 mb-1 block">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm w-36" />
            </div>
            {(dateFrom || dateTo) && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>

          {historyLoading ? (
            <div className="py-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
              <Spinner className="text-blue-500" /> Loading…
            </div>
          ) : purchases.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">No purchase records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-white">
                    {["Date", "Product", "Seller", "Qty Rec", "Ded", "Payable", "Ref.Price", "Gross", "Ded.Amt", "FinalAmt", "Status", "Pmt", "Paid", "Bal", "By"].map((h, i) => (
                      <th key={h} className={`py-3 px-2 font-semibold text-xs uppercase tracking-wide whitespace-nowrap ${i >= 3 && i <= 9 ? "text-right" : i >= 11 ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {purchases.map((p, idx) => (
                    <tr key={p.id} className={`hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                      <td className="py-3 px-3 whitespace-nowrap text-xs text-gray-600">{fmtDateOnly(p.transaction_date)}</td>
                      <td className="py-3 px-3">
                        <p className="font-semibold text-gray-900 text-sm">{p.product_name}</p>
                        <p className="font-mono text-xs text-gray-400">{p.barcode}</p>
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-600">{p.seller}</td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums">
                        {Number(p.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {p.unit_name}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-xs text-red-600">
                        {Number(p.deducted_quantity) > 0
                          ? <span className="text-red-600">−{Number(p.deducted_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-gray-900 tabular-nums text-xs">
                        {Number(p.payable_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}
                      </td>
                      <td className="py-3 px-3 text-right text-gray-600 tabular-nums text-xs">{fmtShort(p.reference_price)}</td>
                      <td className="py-3 px-3 text-right text-gray-600 tabular-nums text-xs">{fmt(p.gross_amount)}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-xs">
                        {Number(p.deduction_amount) > 0
                          ? <span className="text-red-600">−{fmt(p.deduction_amount)}</span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700 tabular-nums">
                        {fmt(p.final_amount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {p.approval_status ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${p.approval_status === "APPROVED" ? "bg-green-100 text-green-700" : p.approval_status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {p.approval_status}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${p.payment_status === "PAID" ? "bg-green-100 text-green-700" : p.payment_status === "PARTIALLY_PAID" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                          {p.payment_status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-gray-700 tabular-nums">
                        {Number(p.amount_paid).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-red-600 tabular-nums">
                        {Number(p.balance_due).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3 text-xs text-gray-500">{p.recorded_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}



export default function CommodityPrices() {
  const [setPriceFor, setSetPriceFor] = useState<CommodityProduct | null>(null);
  const [historyFor, setHistoryFor] = useState<CommodityProduct | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commodity Prices</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage market-based buying prices for commodities like copra and charcoal
          </p>
        </div>
      </div>

      {/* Pending Approvals Section */}
      <PendingApprovalsSection refreshKey={refreshKey} onRefresh={() => setRefreshKey((k) => k + 1)} />

      {/* Info banner */}
      <div className="px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        <strong>How this works:</strong> Set current reference buying price. Clerk records purchase qty & deductions → system calculates payable. Price changes never affect past transactions.
      </div>

      {/* Market-Based Products + Purchase History with Tabs */}
      <MarketBasedWithTabs
        refreshKey={refreshKey}
        onEditPrice={(product: CommodityProduct) => setSetPriceFor(product)}
        onViewHistory={(product: CommodityProduct) => setHistoryFor(product)}
      />

      {/* Modals */}
      <SetPriceModal
        product={setPriceFor}
        onClose={() => setSetPriceFor(null)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />

      {historyFor && (
        <PriceHistoryPanel
          productId={historyFor.id}
          productName={historyFor.product_name}
          unitAbbr={historyFor.unit_abbreviation}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

