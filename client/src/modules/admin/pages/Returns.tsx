import { useState, useEffect, useCallback } from "react";
import { Search, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  getReturns,
  getReturnById,
  approveReturn,
  rejectReturn,
  resolveReturn,
  createReturn,
} from "@/shared/api/returnsApi";
import type { Return, ReturnItem } from "@/shared/api/returnsApi";
import { searchSales, getSaleByInvoice } from "@/shared/api/salesApi";
import type { SaleSummary, Sale } from "@/shared/api/salesApi";
import { printReturnReceipt } from "@/shared/utils/returnReceiptPrinter";
import { toast } from "sonner";
import { useAuth } from "@/shared/contexts/AuthContext";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TabKey = "Pending" | "All Returns" | "Search Sale (No Receipt)";

function StatusBadge({ ret }: { ret: Return }) {
  if (ret.resolution !== null)
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Resolved</span>;
  if (ret.status === "pending")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Pending</span>;
  if (ret.status === "approved")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Approved</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Rejected</span>;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function fmtPeso(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// ─── Reject Dialog ────────────────────────────────────────────────────────────

interface RejectDialogProps {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  loading: boolean;
}

function RejectDialog({ open, onConfirm, onCancel, loading }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reject Return</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label className="font-semibold">Reason for rejection</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason…"
            disabled={loading}
          />
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="destructive" disabled={loading || !reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {loading ? "Rejecting…" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Resolution Dialog ────────────────────────────────────────────────────────

interface ResolutionDialogProps {
  open: boolean;
  returnId: number;
  onClose: () => void;
  onResolved: () => void;
  returnData: Return | null;
}

function ResolutionDialog({ open, returnId, onClose, onResolved, returnData }: ResolutionDialogProps) {
  const { user } = useAuth();
  const [resolution, setResolution] = useState<"refund" | "replacement">("refund");
  const [condition, setCondition] = useState<"good" | "damaged">("good");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const resolved = await resolveReturn(returnId, { resolution, item_condition: condition });
      if (returnData) {
        printReturnReceipt({
          return_number: returnData.return_number,
          invoice_number: returnData.invoice_number,
          customer_name: returnData.customer_name,
          processed_by_name: user?.full_name ?? returnData.cashier_name,
          resolution,
          item_condition: condition,
          refund_amount: resolved.refund_amount,
          items: returnData.items,
          resolved_at: resolved.resolved_at ?? undefined,
        });
      }
      toast.success("Return resolved.");
      onResolved();
      onClose();
    } catch {
      toast.error("Failed to resolve return.");
    } finally {
      setLoading(false);
    }
  };

  const radioCard = (selected: boolean, onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
        selected ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 hover:border-gray-300 text-gray-700"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Process Resolution</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Resolution Type</p>
            <div className="flex gap-2">
              {radioCard(resolution === "refund", () => setResolution("refund"), "💰 Cash Refund")}
              {radioCard(resolution === "replacement", () => setResolution("replacement"), "🔄 Replace Same Product")}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Item Condition</p>
            <div className="flex gap-2">
              {radioCard(condition === "good", () => setCondition("good"), "✅ Good Condition")}
              {radioCard(condition === "damaged", () => setCondition("damaged"), "⚠️ Damaged")}
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? "Processing…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Return Detail Dialog ─────────────────────────────────────────────────────

interface ReturnDetailDialogProps {
  id: number | null;
  onClose: () => void;
  onRefresh: () => void;
}

function ReturnDetailDialog({ id, onClose, onRefresh }: ReturnDetailDialogProps) {
  const [ret, setRet] = useState<Return | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);

  useEffect(() => {
    if (id == null) { setRet(null); return; }
    setLoading(true);
    getReturnById(id).then(setRet).catch(() => toast.error("Failed to load return.")).finally(() => setLoading(false));
  }, [id]);

  const handleApprove = async () => {
    if (!ret) return;
    setActionLoading(true);
    try {
      await approveReturn(ret.id);
      toast.success("Return approved.");
      const updated = await getReturnById(ret.id);
      setRet(updated);
      onRefresh();
    } catch { toast.error("Failed to approve."); }
    finally { setActionLoading(false); }
  };

  const handleReject = async (reason: string) => {
    if (!ret) return;
    setActionLoading(true);
    try {
      await rejectReturn(ret.id, reason);
      toast.success("Return rejected.");
      const updated = await getReturnById(ret.id);
      setRet(updated);
      setRejectOpen(false);
      onRefresh();
    } catch { toast.error("Failed to reject."); }
    finally { setActionLoading(false); }
  };

  return (
    <>
      <Dialog open={id != null} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Return Details</DialogTitle></DialogHeader>
          {loading ? (
            <div className="py-10 text-center text-gray-500">Loading…</div>
          ) : ret ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-gray-500">Return #:</span> <span className="font-semibold">{ret.return_number}</span></div>
                <div><span className="text-gray-500">Invoice #:</span> <span className="font-semibold">{ret.invoice_number}</span></div>
                <div><span className="text-gray-500">Customer:</span> {ret.customer_name}</div>
                <div><span className="text-gray-500">Submitted:</span> {fmtDate(ret.created_at)}</div>
                <div><span className="text-gray-500">Status:</span> <StatusBadge ret={ret} /></div>
                <div><span className="text-gray-500">Submitted by:</span> {ret.cashier_name}</div>
              </div>
              <div className="p-3 bg-gray-50 rounded text-sm">
                <span className="text-gray-500">Reason: </span>{ret.return_reason}
              </div>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    <th className="text-left py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Product</th>
                    <th className="text-center py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Qty</th>
                    <th className="text-right py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Unit Price</th>
                    <th className="text-right py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ret.items.map((item: ReturnItem) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-4 font-medium text-gray-900">{item.product_name}</td>
                      <td className="py-2.5 px-4 text-center font-semibold text-gray-800">{item.quantity_returned}</td>
                      <td className="py-2.5 px-4 text-right text-gray-600">{fmtPeso(item.unit_price)}</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{fmtPeso(item.unit_price * item.quantity_returned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {ret.resolution !== null && (
                <div className="p-3 bg-blue-50 rounded text-sm flex gap-4">
                  <div><span className="text-gray-500">Resolution:</span> <span className="font-semibold capitalize">{ret.resolution}</span></div>
                  {ret.resolution === "refund" && ret.refund_amount != null
                    ? <div><span className="text-gray-500">Refund:</span> <span className="font-semibold">{fmtPeso(ret.refund_amount)}</span></div>
                    : <div><span className="font-semibold text-blue-700">REPLACEMENT</span></div>}
                </div>
              )}
              <DialogFooter className="gap-2 flex-wrap">
                {ret.status === "pending" && ret.resolution === null && (
                  <>
                    <Button variant="outline" className="text-red-600 border-red-300" onClick={() => setRejectOpen(true)} disabled={actionLoading}>Reject</Button>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={actionLoading}>Approve</Button>
                  </>
                )}
                {ret.status === "approved" && ret.resolution === null && (
                  <Button onClick={() => setResolutionOpen(true)} disabled={actionLoading}>Process Resolution</Button>
                )}
                <Button variant="outline" onClick={onClose}>Close</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <RejectDialog open={rejectOpen} onConfirm={handleReject} onCancel={() => setRejectOpen(false)} loading={actionLoading} />
      {ret && (
        <ResolutionDialog
          open={resolutionOpen}
          returnId={ret.id}
          onClose={() => setResolutionOpen(false)}
          onResolved={() => { setResolutionOpen(false); getReturnById(ret.id).then(setRet); onRefresh(); }}
          returnData={ret}
        />
      )}
    </>
  );
}


// ─── Returns List ─────────────────────────────────────────────────────────────

interface ReturnsListProps {
  tab: "Pending" | "All Returns";
}

function ReturnsList({ tab }: ReturnsListProps) {
  const [rows, setRows] = useState<Return[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Search / filter state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getReturns(tab === "Pending" ? { status: "pending" } : undefined);
      setRows(data);
    } catch { toast.error("Failed to load returns."); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  // Reset filters when tab changes
  useEffect(() => { setSearch(""); setFilterStatus("all"); }, [tab]);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    try { await approveReturn(id); toast.success("Return approved."); load(); }
    catch { toast.error("Failed to approve."); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    setActionLoading(rejectTarget);
    try {
      await rejectReturn(rejectTarget, reason);
      toast.success("Return rejected.");
      setRejectTarget(null);
      load();
    } catch { toast.error("Failed to reject."); }
    finally { setActionLoading(null); }
  };

  // Client-side filtering
  const q = search.toLowerCase();
  const filtered = rows.filter((r) => {
    const matchSearch = !q
      || r.return_number.toLowerCase().includes(q)
      || r.invoice_number.toLowerCase().includes(q)
      || r.customer_name.toLowerCase().includes(q)
      || r.cashier_name.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all"
      || (filterStatus === "resolved" && r.resolution !== null)
      || (filterStatus === "pending"  && r.status === "pending"  && r.resolution === null)
      || (filterStatus === "approved" && r.status === "approved" && r.resolution === null)
      || (filterStatus === "rejected" && r.status === "rejected");
    return matchSearch && matchStatus;
  });

  const hasFilters = search || filterStatus !== "all";

  return (
    <>
      {/* Search bar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-56 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search return #, invoice #, customer, cashier…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400 text-gray-800"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {tab === "All Returns" && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 bg-gray-50 border-gray-200 text-gray-700 h-10">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          )}
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {hasFilters && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
              <button
                onClick={() => { setSearch(""); setFilterStatus("all"); }}
                className="text-blue-600 font-semibold hover:underline"
              >Clear</button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                {["Return #", "Invoice #", "Customer", "Submitted By", "Date", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="py-20 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-400">
                    <span className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <Search className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="font-semibold text-gray-700">
                      {hasFilters ? "No returns match your search" : "No returns found"}
                    </p>
                    {hasFilters && (
                      <button
                        onClick={() => { setSearch(""); setFilterStatus("all"); }}
                        className="text-blue-600 text-xs font-semibold hover:underline"
                      >Clear filters</button>
                    )}
                  </div>
                </td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="hover:bg-blue-50/40 transition-colors">
                  <td className="py-3.5 px-5">
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">{r.return_number}</span>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="font-mono text-xs text-gray-600">{r.invoice_number}</span>
                  </td>
                  <td className="py-3.5 px-5 font-medium text-gray-900">{r.customer_name}</td>
                  <td className="py-3.5 px-5 text-sm text-gray-600">{r.cashier_name}</td>
                  <td className="py-3.5 px-5 text-sm text-gray-500">{fmtDate(r.created_at)}</td>
                  <td className="py-3.5 px-5"><StatusBadge ret={r} /></td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => setDetailId(r.id)}
                        className="h-7 px-3 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors">
                        View
                      </button>
                      {r.status === "pending" && r.resolution === null && (
                        <>
                          <button
                            disabled={actionLoading === r.id}
                            onClick={() => handleApprove(r.id)}
                            className="h-7 px-3 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50">
                            Approve
                          </button>
                          <button
                            disabled={actionLoading === r.id}
                            onClick={() => setRejectTarget(r.id)}
                            className="h-7 px-3 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium">
              {hasFilters ? `${filtered.length} of ${rows.length}` : rows.length} return{rows.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-400">Isra Hardware POS</p>
          </div>
        )}
      </div>
      <ReturnDetailDialog id={detailId} onClose={() => setDetailId(null)} onRefresh={load} />
      <RejectDialog open={rejectTarget != null} onConfirm={handleReject} onCancel={() => setRejectTarget(null)} loading={actionLoading === rejectTarget} />
    </>
  );
}


// ─── Initiate Return Dialog ───────────────────────────────────────────────────

interface InitiateReturnDialogProps {
  sale: Sale | null;
  onClose: () => void;
}

const RETURN_REASONS = ["Damaged", "Wrong Item", "Missing Items", "Defective / Not Working", "Change of Mind", "Other"];

function InitiateReturnDialog({ sale, onClose }: InitiateReturnDialogProps) {
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sale) { setReason(""); setQtys({}); return; }
    const init: Record<number, number> = {};
    sale.items.filter(i => i.is_returnable && i.quantity - i.quantity_returned > 0).forEach(i => { init[i.id] = 0; });
    setQtys(init);
  }, [sale]);

  const handleSubmit = async () => {
    if (!sale) return;
    const selectedItems = sale.items.filter(i => (qtys[i.id] ?? 0) > 0);
    if (selectedItems.length === 0) { toast.error("Select at least one item to return."); return; }
    setLoading(true);
    try {
      await createReturn({
        sale_id: sale.id,
        return_reason: reason.trim(),
        items: selectedItems.map(i => ({
          sale_item_id: i.id,
          product_id: i.product_id,
          quantity_returned: qtys[i.id],
          unit_price: Number(i.unit_price),
        })),
      });
      toast.success("Return request submitted.");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to submit return.");
    } finally { setLoading(false); }
  };

  const returnableItems = sale?.items.filter(i => i.is_returnable && i.quantity - i.quantity_returned > 0) ?? [];

  return (
    <Dialog open={sale != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Initiate Return — {sale?.invoice_number}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left py-2 px-2 font-semibold text-gray-700">Product</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700">Available</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-700">Return Qty</th>
              </tr>
            </thead>
            <tbody>
              {returnableItems.length === 0
                ? <tr><td colSpan={3} className="py-4 text-center text-gray-500">No returnable items.</td></tr>
                : returnableItems.map(item => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 px-2">{item.product_name}</td>
                    <td className="py-2 px-2 text-center">{item.quantity - item.quantity_returned}</td>
                    <td className="py-2 px-2 text-center">
                      <Input type="number" min={0} max={item.quantity - item.quantity_returned}
                        value={qtys[item.id] ?? 0}
                        onChange={e => setQtys(q => ({ ...q, [item.id]: Math.min(Number(e.target.value), item.quantity - item.quantity_returned) }))}
                        className="w-16 text-center h-7 px-1 mx-auto" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div>
            <Label className="font-semibold mb-1.5 block">Return Reason</Label>
            <select
              value={reason}
              onChange={e => setReason(e.target.value)}
              disabled={loading}
              className="w-full h-9 text-sm border border-gray-300 rounded-md px-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {RETURN_REASONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || returnableItems.length === 0}>
            {loading ? "Submitting…" : "Submit Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Sale Detail Modal ────────────────────────────────────────────────────────

function SaleDetailModal({ sale, onClose, onInitiateReturn }: {
  sale: Sale | null;
  onClose: () => void;
  onInitiateReturn: (sale: Sale) => void;
}) {
  if (!sale) return null;
  const returnableCount = sale.items.filter(i => i.is_returnable && i.quantity - i.quantity_returned > 0).length;
  return (
    <Dialog open={!!sale} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{sale.invoice_number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm bg-gray-50 rounded-xl p-4">
            <div><span className="text-gray-500">Date:</span> <span className="font-medium">{fmtDate(sale.created_at)}</span></div>
            <div><span className="text-gray-500">Cashier:</span> <span className="font-medium">{sale.cashier_name}</span></div>
            <div><span className="text-gray-500">Customer:</span> <span className="font-semibold text-gray-900">{sale.customer_name}</span></div>
            {sale.customer_tin && <div><span className="text-gray-500">TIN:</span> <span className="text-gray-700">{sale.customer_tin}</span></div>}
            {sale.customer_address && (
              <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="text-gray-700">{sale.customer_address}</span></div>
            )}
          </div>

          {/* Items */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Product</th>
                  <th className="text-center py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Qty</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Unit Price</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Subtotal</th>
                  <th className="text-center py-2.5 px-4 font-semibold text-gray-600 text-xs uppercase tracking-wide">Returnable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sale.items.map((item) => {
                  const remaining = item.quantity - item.quantity_returned;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-gray-900">{item.product_name}</p>
                        {item.barcode && <p className="font-mono text-xs text-gray-400">{item.barcode}</p>}
                      </td>
                      <td className="py-2.5 px-4 text-center font-semibold">{item.quantity}</td>
                      <td className="py-2.5 px-4 text-right text-gray-600">{fmtPeso(item.unit_price)}</td>
                      <td className="py-2.5 px-4 text-right font-semibold">{fmtPeso(item.subtotal)}</td>
                      <td className="py-2.5 px-4 text-center">
                        {item.is_returnable
                          ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              remaining > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                            }`}>{remaining > 0 ? `${remaining} left` : "Returned"}</span>
                          : <span className="text-xs text-gray-400">No</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span className="tabular-nums">{fmtPeso(sale.subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>VAT</span><span className="tabular-nums">{fmtPeso(sale.vat_amount)}</span></div>
            <div className="flex justify-between font-bold text-lg text-gray-900 pt-2 border-t border-gray-200">
              <span>Total</span><span className="tabular-nums text-blue-600">{fmtPeso(sale.total_amount)}</span>
            </div>
            <div className="flex justify-between text-gray-600"><span>Cash Tendered</span><span className="tabular-nums">{fmtPeso(sale.cash_tendered)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Change</span><span className="tabular-nums">{fmtPeso(sale.change_amount)}</span></div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {returnableCount > 0 && (
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { onClose(); onInitiateReturn(sale); }}>
              Initiate Return
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Sales Search Panel ───────────────────────────────────────────────────────

function SalesSearchPanel() {
  const [invoiceNum, setInvoiceNum] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [results, setResults] = useState<SaleSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [viewSale, setViewSale] = useState<Sale | null>(null);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [loadingSale, setLoadingSale] = useState<number | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    try {
      const data = await searchSales({
        invoice_number: invoiceNum.trim() || undefined,
        customer_name: customerName.trim() || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setResults(data);
    } catch { toast.error("Failed to search sales."); }
    finally { setSearching(false); }
  };

  const handleLoadSale = async (summary: SaleSummary, mode: "view" | "return") => {
    setLoadingSale(summary.id);
    try {
      const sale = await getSaleByInvoice(summary.invoice_number);
      if (mode === "view") setViewSale(sale);
      else setReturnSale(sale);
    } catch { toast.error("Failed to load sale."); }
    finally { setLoadingSale(null); }
  };

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs font-semibold mb-1 block">Invoice #</Label>
            <Input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="INV-000001" className="w-40" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Customer Name</Label>
            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer…" className="w-40" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Date From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
          </div>
          <div>
            <Label className="text-xs font-semibold mb-1 block">Date To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
          </div>
          <Button type="submit" disabled={searching} className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 text-sm">{searching ? "Searching…" : "Search"}</Button>
        </form>
      </div>
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  {["Invoice #", "Customer", "Cashier", "Date", "Total", "Actions"].map(h => (
                    <th key={h} className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((s) => (
                  <tr key={s.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">{s.invoice_number}</span>
                    </td>
                    <td className="py-3.5 px-5 font-medium text-gray-900">{s.customer_name}</td>
                    <td className="py-3.5 px-5 text-sm text-gray-600">{s.cashier_name}</td>
                    <td className="py-3.5 px-5 text-sm text-gray-500">{fmtDate(s.created_at)}</td>
                    <td className="py-3.5 px-5 font-bold text-gray-900 tabular-nums">{fmtPeso(s.total_amount)}</td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-1.5">
                        <button disabled={loadingSale === s.id} onClick={() => handleLoadSale(s, "view")}
                          className="h-7 px-3 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50">
                          View Purchase
                        </button>
                        <button disabled={loadingSale === s.id} onClick={() => handleLoadSale(s, "return")}
                          className="h-7 px-3 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50">
                          {loadingSale === s.id ? "Loading…" : "Initiate Return"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-500 font-medium">{results.length} sale{results.length !== 1 ? "s" : ""} found</p>
          </div>
        </div>
      )}
      <SaleDetailModal
        sale={viewSale}
        onClose={() => setViewSale(null)}
        onInitiateReturn={(sale) => setReturnSale(sale)}
      />
      <InitiateReturnDialog sale={returnSale} onClose={() => setReturnSale(null)} />
    </>
  );
}


// ─── Main Returns Page ────────────────────────────────────────────────────────

const TABS: TabKey[] = ["Pending", "All Returns", "Search Sale (No Receipt)"];

export default function Returns() {
  const [activeTab, setActiveTab] = useState<TabKey>("Pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-gray-900">Returns Management</h1>
        <p className="text-gray-600 mt-1">Review and process customer return requests</p>
      </div>

      {/* Tab row */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "Pending" && <ReturnsList tab="Pending" />}
      {activeTab === "All Returns" && <ReturnsList tab="All Returns" />}
      {activeTab === "Search Sale (No Receipt)" && <SalesSearchPanel />}
    </div>
  );
}
