import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    approveCommodityPurchase,
    getCommodityProducts,
    getPendingCommodityPurchases,
    getPriceHistory,
    getPurchaseHistory,
    rejectCommodityPurchase,
    setPrice,
    type CommodityPriceRecord,
    type CommodityProduct,
    type CommodityPurchase,
} from "@/shared/api/commodityApi";
import axios from "axios";
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Edit2,
    History, RefreshCw,
    TrendingUp,
    X,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
      window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
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
      window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
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
                  {["Date", "Product", "Seller", "Address", "Contact", "Qty Received", "Deducted", "Payable", "Ref. Price", "Gross", "Deduction", "Final Amount", "Submitted By", "Actions"].map((h) => (
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
                    <td className="py-3 px-3 text-xs text-gray-500 max-w-[140px]">
                      {(p as any).seller_address || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-3 px-3 text-xs text-gray-500 whitespace-nowrap">
                      {(p as any).seller_contact || <span className="text-gray-300">—</span>}
                    </td>
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
        <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Confirm Approval</DialogTitle>
          {/* Emerald header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-emerald-400 rounded-t-lg">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Confirm Approval</h2>
              <p className="text-xs text-emerald-100 mt-0.5">Inventory will be updated upon approval</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Amber warning banner */}
            <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                Inventory has not been updated yet. Approving will add the received quantity to inventory immediately.
              </p>
            </div>

            {/* Purchase info card */}
            {showApproveModal && (() => {
              const p = purchases.find(x => x.id === showApproveModal);
              if (!p) return null;
              return (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm space-y-1.5">
                  <p className="font-semibold text-gray-900">{p.product_name}</p>
                  <p className="text-xs text-gray-500 font-mono">{p.barcode}</p>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <span className="text-xs text-gray-500">Seller</span>
                    <span className="text-xs font-medium text-gray-700">{p.seller || "—"}</span>
                  </div>
                  {(p as any).seller_address && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Address</span>
                      <span className="text-xs text-gray-700 text-right">{(p as any).seller_address}</span>
                    </div>
                  )}
                  {(p as any).seller_contact && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Contact</span>
                      <span className="text-xs text-gray-700 font-mono">{(p as any).seller_contact}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Qty Received</span>
                    <span className="text-xs font-semibold text-gray-900">{Number(p.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {p.unit_name}</span>
                  </div>
                  {Number(p.deducted_quantity) > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Deducted</span>
                      <span className="text-xs font-semibold text-red-600">−{Number(p.deducted_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {p.unit_name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <span className="text-xs font-bold text-gray-700">Final Amount</span>
                    <span className="text-sm font-bold text-emerald-700">{fmt(p.final_amount)}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowApproveModal(null)} disabled={approvingId !== null}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approvingId !== null}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {approvingId !== null && <Spinner className="text-white" />}
              {approvingId !== null ? "Approving…" : "Confirm Approval"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={!!showRejectModal} onOpenChange={(o) => { if (!o) { setShowRejectModal(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Reject Purchase</DialogTitle>
          {/* Red header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-red-400 rounded-t-lg">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <XCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Reject Purchase</h2>
              <p className="text-xs text-red-100 mt-0.5">This action will notify the clerk</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3">
            <Label className="font-semibold">Rejection Reason <span className="text-red-500">*</span></Label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Invalid quantity, wrong product, documentation missing…"
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400"
            />
            {rejectReason.trim() === "" && (
              <p className="text-xs text-red-500">Rejection reason is required.</p>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowRejectModal(null); setRejectReason(""); }}>Cancel</Button>
            <Button
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejectingId !== null}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {rejectingId !== null && <Spinner className="text-white" />}
              {rejectingId !== null ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </div>
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
      <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Set Reference Price</DialogTitle>
        {/* Amber header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-amber-400 rounded-t-lg">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Set Reference Price</h2>
            <p className="text-xs text-amber-100 mt-0.5 truncate max-w-[220px]">{product?.product_name ?? ""}</p>
          </div>
        </div>

        {product && (
          <div className="px-6 py-5 space-y-4">
            {/* Current price card */}
            {product.current_price != null && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">Current Reference Price</p>
                <p className="text-2xl font-bold text-amber-700 tabular-nums mt-0.5">
                  {fmtShort(product.current_price)}
                  <span className="text-sm font-normal text-gray-500"> / {product.unit_abbreviation}</span>
                </p>
              </div>
            )}

            <div>
              <Label className="mb-1.5 block font-semibold text-sm">
                New Buying Price (₱ per {product.unit_abbreviation}) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number" min="0.0001" step="0.01"
                value={price}
                onChange={(e) => setPrice_(e.target.value)}
                placeholder="e.g. 40.00"
                className="h-11 text-lg font-bold"
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
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                <strong>Historical transactions are not affected.</strong> Only new purchases will use this price.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
          </div>
        )}

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white gap-2">
            {saving && <Spinner className="text-white" />}
            {saving ? "Saving…" : "Set Price"}
          </Button>
        </div>
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
      <DialogContent className="max-w-lg p-0 flex flex-col gap-0 overflow-hidden max-h-[80vh]">
        <DialogTitle className="sr-only">Price History</DialogTitle>
        {/* Amber header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-amber-600 rounded-t-lg shrink-0">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <History className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Price History</h2>
            <p className="text-xs text-amber-100 mt-0.5 truncate max-w-[240px]">{productName}</p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loading ? (
            <div className="py-8 text-center text-gray-400 flex items-center justify-center gap-2">
              <Spinner className="text-amber-500" /> Loading…
            </div>
          ) : history.length === 0 ? (
            <p className="py-8 text-center text-gray-400 text-sm">No price history yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((h, idx) => (
                <div key={h.id} className={`p-3 rounded-lg border-2 ${idx === 0 ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white"}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xl font-bold tabular-nums ${idx === 0 ? "text-amber-700" : "text-gray-700"}`}>
                      {fmtShort(h.price_per_unit)}<span className="text-sm font-normal text-gray-500">/{unitAbbr}</span>
                    </span>
                    {idx === 0 && (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDate(h.effective_from)} · by {h.changed_by_name}
                  </p>
                  {h.reason && (
                    <p className="text-xs text-gray-600 mt-1 italic bg-gray-50 border border-gray-100 rounded px-2 py-1">"{h.reason}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
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
  const [sellerSearch, setSellerSearch] = useState("");
  const [selectedPurchase, setSelectedPurchase] = useState<CommodityPurchase | null>(null);

  // Filter purchases by seller name
  const filteredPurchases = sellerSearch.trim()
    ? purchases.filter((p) =>
        p.seller?.toLowerCase().includes(sellerSearch.toLowerCase())
      )
    : purchases;

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
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Commodity Product", "Unit", "Current Buying Price", "Effective From", "Stock", "Actions"].map((h, i) => (
                    <th key={h} className={`py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide ${i >= 2 && i <= 4 ? "text-right" : i === 5 ? "text-center" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <p className="font-bold text-slate-900">{p.product_name}</p>
                      <p className="font-mono text-xs text-slate-400 mt-0.5">{p.barcode}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">
                        {p.unit} ({p.unit_abbreviation})
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {p.current_price != null ? (
                        <span className="text-base font-bold text-amber-700 font-mono tabular-nums">
                          {fmtShort(p.current_price)}/{p.unit_abbreviation}
                        </span>
                      ) : (
                        <span className="text-xs text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded border border-red-200">Not set</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right text-xs text-slate-500 font-medium">
                      {p.price_effective_from ? fmtDate(p.price_effective_from) : "—"}
                    </td>
                    <td className="py-3.5 px-5 text-right font-bold text-slate-900 font-mono tabular-nums">
                      {Number(p.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title="Update price"
                          onClick={() => onEditPrice(p)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          title="Price history"
                          onClick={() => onViewHistory(p)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
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
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap gap-3 items-end bg-slate-50">
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wide">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm w-36 bg-white border-slate-300" />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wide">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm w-36 bg-white border-slate-300" />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block uppercase tracking-wide">Seller</Label>
              <Input 
                type="text" 
                value={sellerSearch} 
                onChange={(e) => setSellerSearch(e.target.value)} 
                placeholder="Search seller…" 
                className="h-9 text-sm w-52 bg-white border-slate-300" 
              />
            </div>
            {(dateFrom || dateTo || sellerSearch) && (
              <Button variant="outline" size="sm" className="h-9 text-xs border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer" onClick={() => { setDateFrom(""); setDateTo(""); setSellerSearch(""); }}>
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>

          {historyLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
              <Spinner className="text-blue-600" /> Loading purchase records…
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm font-medium">{sellerSearch.trim() ? "No matching sellers found." : "No commodity purchase records found."}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {["Date", "Product", "Seller", "Address", "Contact", "Qty Rec", "Ded", "Payable", "Ref. Price", "Gross", "Ded. Amt", "Final Amount", "Approval", "Payment", "Recorded By"].map((h, i) => (
                      <th key={h} className={`py-3.5 px-3 font-bold text-slate-700 text-xs uppercase tracking-wide whitespace-nowrap ${i >= 5 && i <= 11 ? "text-right" : i >= 12 && i <= 13 ? "text-center" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPurchases.map((p, idx) => (
                    <tr 
                      key={p.id} 
                      className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                      onClick={() => setSelectedPurchase(p)}
                    >
                      <td className="py-3.5 px-3 whitespace-nowrap text-xs text-slate-600 font-medium">{fmtDateOnly(p.transaction_date)}</td>
                      <td className="py-3.5 px-3">
                        <p className="font-bold text-slate-900 text-sm">{p.product_name}</p>
                        <p className="font-mono text-xs text-slate-400">{p.barcode}</p>
                      </td>
                      <td className="py-3.5 px-3 text-xs font-semibold text-slate-800">{p.seller}</td>
                      <td className="py-3.5 px-3 text-xs text-slate-500 max-w-[130px] truncate" title={(p as any).seller_address || ""}>
                        {(p as any).seller_address || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-600 whitespace-nowrap font-mono">
                        {(p as any).seller_contact || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-900 font-mono tabular-nums">
                        {Number(p.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {p.unit_name}
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums text-xs font-mono text-red-600">
                        {Number(p.deducted_quantity) > 0
                          ? <span className="text-red-600 font-bold">−{Number(p.deducted_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-900 font-mono tabular-nums text-xs">
                        {Number(p.payable_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-600 font-mono tabular-nums text-xs">{fmtShort(p.reference_price)}</td>
                      <td className="py-3.5 px-3 text-right text-slate-600 font-mono tabular-nums text-xs">{fmt(p.gross_amount)}</td>
                      <td className="py-3.5 px-3 text-right tabular-nums text-xs font-mono">
                        {Number(p.deduction_amount) > 0
                          ? <span className="text-red-600 font-bold">−{fmt(p.deduction_amount)}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-emerald-700 font-mono tabular-nums">
                        {fmt(p.final_amount)}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        {p.approval_status ? (
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${p.approval_status === "APPROVED" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : p.approval_status === "REJECTED" ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-800 border border-amber-200"}`}>
                            {p.approval_status}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${p.payment_status === "PAID" ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : p.payment_status === "PARTIALLY_PAID" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-red-100 text-red-700 border border-red-200"}`}>
                          {p.payment_status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-xs text-slate-500 font-medium">{p.recorded_by_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Transaction Detail Modal */}
      <Dialog open={!!selectedPurchase} onOpenChange={(o) => { if (!o) setSelectedPurchase(null); }}>
        <DialogContent className="max-w-2xl p-0 flex flex-col gap-0 overflow-hidden max-h-[90vh]">
          <DialogTitle className="sr-only">Transaction Details</DialogTitle>
          {/* Slate header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-slate-700 rounded-t-lg shrink-0">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <History className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Transaction Details</h2>
              <p className="text-xs text-slate-300 mt-0.5 truncate max-w-[300px]">{selectedPurchase?.product_name ?? ""}</p>
            </div>
          </div>

          {selectedPurchase && (
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Product + Quantity */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Product</p>
                  <p className="font-semibold text-gray-900">{selectedPurchase.product_name}</p>
                  <p className="font-mono text-xs text-gray-500">{selectedPurchase.barcode}</p>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Quantity Breakdown</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Received</span><span className="font-semibold">{Number(selectedPurchase.quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {selectedPurchase.unit_name}</span></div>
                    {Number(selectedPurchase.deducted_quantity) > 0 && (
                      <div className="flex justify-between"><span className="text-gray-500">Deducted</span><span className="font-semibold text-red-600">−{Number(selectedPurchase.deducted_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })}</span></div>
                    )}
                    <div className="flex justify-between border-t border-amber-200 pt-1"><span className="font-semibold text-gray-700">Payable</span><span className="font-bold text-emerald-700">{Number(selectedPurchase.payable_quantity).toLocaleString("en-PH", { maximumFractionDigits: 4 })} {selectedPurchase.unit_name}</span></div>
                  </div>
                </div>
              </div>

              {/* Financials */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3">Financial Details</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Ref. Price</span><span className="font-medium">{fmtShort(selectedPurchase.reference_price)}/{selectedPurchase.unit_name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Gross Amount</span><span className="font-medium">{fmt(selectedPurchase.gross_amount)}</span></div>
                  {Number(selectedPurchase.deduction_amount) > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">Deduction</span><span className="font-medium text-red-600">−{fmt(selectedPurchase.deduction_amount)}</span></div>
                  )}
                  <div className="col-span-2 flex justify-between pt-1 border-t border-emerald-200">
                    <span className="font-bold text-gray-700">Final Amount</span>
                    <span className="font-bold text-xl text-emerald-700 tabular-nums">{fmt(selectedPurchase.final_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Status + Meta */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status & Info</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500 text-xs block mb-0.5">Approval</span>
                    {selectedPurchase.approval_status ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${selectedPurchase.approval_status === "APPROVED" ? "bg-green-100 text-green-700" : selectedPurchase.approval_status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{selectedPurchase.approval_status}</span>
                    ) : "—"}
                  </div>
                  <div><span className="text-gray-500 text-xs block mb-0.5">Payment</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${selectedPurchase.payment_status === "PAID" ? "bg-green-100 text-green-700" : selectedPurchase.payment_status === "PARTIALLY_PAID" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{selectedPurchase.payment_status}</span>
                  </div>
                  <div><span className="text-gray-500 text-xs block mb-0.5">Seller</span><span className="font-medium">{selectedPurchase.seller || "—"}</span></div>
                  <div className="col-span-2">
                    <span className="text-gray-500 text-xs block mb-0.5">Seller Address</span>
                    <span className="font-medium text-sm">{selectedPurchase.seller_address || <span className="text-gray-400 font-normal">—</span>}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs block mb-0.5">Seller Contact</span>
                    <span className="font-medium font-mono">{selectedPurchase.seller_contact || <span className="text-gray-400 font-normal">—</span>}</span>
                  </div>
                  <div><span className="text-gray-500 text-xs block mb-0.5">Date</span><span className="font-medium">{fmtDateOnly(selectedPurchase.transaction_date)}</span></div>
                  <div><span className="text-gray-500 text-xs block mb-0.5">Submitted By</span><span className="font-medium">{selectedPurchase.prepared_by_name || "—"}</span></div>
                  {selectedPurchase.approved_by_name && <div><span className="text-gray-500 text-xs block mb-0.5">Approved By</span><span className="font-medium">{selectedPurchase.approved_by_name}</span></div>}
                  {selectedPurchase.rejection_reason && (
                    <div className="col-span-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                      <span className="text-gray-500 text-xs block mb-0.5">Rejection Reason</span>
                      <span className="font-medium text-red-700">{selectedPurchase.rejection_reason}</span>
                    </div>
                  )}
                  {selectedPurchase.remarks && (
                    <div className="col-span-2"><span className="text-gray-500 text-xs block mb-0.5">Remarks</span><span className="font-medium text-gray-900">{selectedPurchase.remarks}</span></div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
            <Button variant="outline" onClick={() => setSelectedPurchase(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
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

