import { useState, useEffect, useCallback } from "react";
import { Search, X, RefreshCw, AlertCircle, Package, FileText, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getPendingRequests, getRequestHistory, approveRequest, rejectRequest, type UnifiedRequest } from "@/shared/api/requestsApi";
import { toast } from "sonner";
import { formatQuantity, formatQuantityParts } from "@/shared/utils/quantityFormat";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MainTabKey = "Pending Requests" | "History";
type SubTabKey = "All" | "Stock Count" | "Void" | "Returns" | "Market-Based";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

 function fmtPeso(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TypeBadge({ type }: { type: UnifiedRequest["type"] }) {
  if (type === "STOCK_COUNT_STANDARD")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1"><Package className="h-3 w-3" /> Standard</span>;
  if (type === "STOCK_COUNT_MARKET")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 flex items-center gap-1"><Package className="h-3 w-3" /> Market-Based</span>;
  if (type === "VOID")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1"><Ban className="h-3 w-3" /> Void</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1"><RotateCcw className="h-3 w-3" /> Return</span>;
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === "PENDING" || s === "PENDING_APPROVAL")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Pending</span>;
  if (s === "APPROVED")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Approved</span>;
  return <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Rejected</span>;
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
        <DialogHeader><DialogTitle>Reject Request</DialogTitle></DialogHeader>
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

// ─── Detail Dialog ────────────────────────────────────────────────────────────

interface DetailDialogProps {
  req: UnifiedRequest | null;
  onClose: () => void;
  onApprove: (type: string, id: number) => void;
  onReject: (type: string, id: number) => void;
  actionLoading: boolean;
}

function DetailDialog({ req, onClose, onApprove, onReject, actionLoading }: DetailDialogProps) {
  if (!req) return null;
  
  const isPending = req.status.toLowerCase() === "pending" || req.status === "PENDING_APPROVAL";
  const typeMap: Record<string, string> = {
    "STOCK_COUNT_STANDARD": "stock-count-standard",
    "STOCK_COUNT_MARKET": "stock-count-market",
    "VOID": "void",
    "RETURN": "return",
  };

  return (
    <Dialog open={!!req} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Request Details</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><span className="text-gray-500">Type:</span> <TypeBadge type={req.type} /></div>
            <div><span className="text-gray-500">Reference:</span> <span className="font-mono font-semibold">{req.reference}</span></div>
            <div><span className="text-gray-500">Requested By:</span> {req.requested_by_name}</div>
            <div><span className="text-gray-500">Date:</span> {fmtDate(req.created_at || req.prepared_at)}</div>
            <div><span className="text-gray-500">Status:</span> <StatusBadge status={req.status} /></div>
          </div>

          {/* Reason */}
          <div className="p-3 bg-gray-50 rounded-lg text-sm border border-gray-200">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reason</span>
            <p className="mt-1 text-gray-800">{req.reason}</p>
          </div>

          {/* Remarks */}
          {req.remarks && (
            <div className="p-3 bg-gray-50 rounded-lg text-sm border border-gray-200">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Remarks</span>
              <p className="mt-1 text-gray-800">{req.remarks}</p>
            </div>
          )}

          {/* Type-specific details */}
          {req.type.startsWith("STOCK_COUNT") && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm border border-blue-200">
              <div className="grid grid-cols-3 gap-4">
                <div><span className="text-gray-500">Product:</span> <span className="font-medium">{req.product_name}</span></div>
                <div><span className="text-gray-500">System Qty:</span> <span className="font-semibold">{(() => {
                  const isWeighted = req.quantity_type === "WEIGHTED";
                  return isWeighted ? req.system_quantity?.toFixed(3) : req.system_quantity;
                })()}</span></div>
                <div><span className="text-gray-500">Physical Qty:</span> <span className="font-semibold">{(() => {
                  const isWeighted = req.quantity_type === "WEIGHTED";
                  return isWeighted ? req.physical_quantity?.toFixed(3) : req.physical_quantity;
                })()}</span></div>
                <div><span className="text-gray-500">Difference:</span> <span className={`font-bold ${req.difference && req.difference > 0 ? "text-blue-600" : "text-red-600"}`}>{(() => {
                  const isWeighted = req.quantity_type === "WEIGHTED";
                  const displayDiff = isWeighted ? req.difference?.toFixed(3) : Math.round(req.difference || 0);
                  return displayDiff;
                })()}</span></div>
              </div>
            </div>
          )}

          {req.type === "VOID" && (
            <div className="p-3 bg-red-50 rounded-lg text-sm border border-red-200">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-gray-500">Invoice #:</span> <span className="font-mono font-semibold">{req.invoice_number}</span></div>
                <div><span className="text-gray-500">Amount:</span> <span className="font-bold">{fmtPeso(req.amount || 0)}</span></div>
                <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{req.customer_name || 'N/A'}</span></div>
              </div>
            </div>
          )}

          {req.type === "RETURN" && (
            <div className="p-3 bg-green-50 rounded-lg text-sm border border-green-200">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-gray-500">Return #:</span> <span className="font-mono font-semibold">{req.return_number}</span></div>
                <div><span className="text-gray-500">Invoice #:</span> <span className="font-mono font-semibold">{req.invoice_number}</span></div>
                <div><span className="text-gray-500">Product:</span> <span className="font-medium">{req.product_name}</span></div>
                <div><span className="text-gray-500">Barcode:</span> <span className="font-mono">{req.barcode}</span></div>
                <div><span className="text-gray-500">Quantity Returned:</span> <span className="font-semibold">{req.physical_quantity}</span></div>
                <div><span className="text-gray-500">Unit Price:</span> <span className="font-semibold">{fmtPeso(req.unit_price || 0)}</span></div>
                <div><span className="text-gray-500">Refund Amount:</span> <span className="font-bold">{fmtPeso(req.amount || 0)}</span></div>
                <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{req.customer_name || 'N/A'}</span></div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 flex-wrap">
          {isPending && (
            <>
              <Button variant="outline" className="text-red-600 border-red-300" onClick={() => onReject(typeMap[req.type], req.id)} disabled={actionLoading}>Reject</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => onApprove(typeMap[req.type], req.id)} disabled={actionLoading}>
                {actionLoading ? "Processing…" : "Approve"}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Requests List ─────────────────────────────────────────────────────────────

function RequestsList({ mainTab, subTab }: { mainTab: MainTabKey; subTab: SubTabKey }) {
  const [rows, setRows] = useState<UnifiedRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [detailReq, setDetailReq] = useState<UnifiedRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ type: string; id: number } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data: UnifiedRequest[];
      if (mainTab === "Pending Requests") {
        data = await getPendingRequests();
      } else {
        const typeFilter = subTab === "All" ? undefined : 
          subTab === "Stock Count" ? undefined :
          subTab === "Market-Based" ? "STOCK_COUNT_MARKET" :
          subTab === "Void" ? "VOID" : "RETURN";
        data = await getRequestHistory({
          type: typeFilter,
          status: filterStatus === "all" ? undefined : filterStatus,
          search: search || undefined,
        });
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load requests:", err);
      toast.error("Failed to load requests");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [mainTab, subTab, filterStatus, search]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (type: string, id: number) => {
    setActionLoading(true);
    try {
      await approveRequest(type, id);
      toast.success("Request approved.");
      setDetailReq(null);
      load();
      // Dispatch event to refresh sidebar counts immediately
      window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to approve request.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await rejectRequest(rejectTarget.type, rejectTarget.id, reason);
      toast.success("Request rejected.");
      setRejectTarget(null);
      setDetailReq(null);
      load();
      // Dispatch event to refresh sidebar counts immediately
      window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to reject request.");
    } finally {
      setActionLoading(false);
    }
  };

  // Client-side filtering for pending tab
  const q = search.toLowerCase();
  const filtered = rows.filter((r) => {
    if (mainTab === "Pending Requests") {
      // Filter by sub-tab type
      if (subTab === "Stock Count" && !r.type.startsWith("STOCK_COUNT")) return false;
      if (subTab === "Market-Based" && r.type !== "STOCK_COUNT_MARKET") return false;
      if (subTab === "Void" && r.type !== "VOID") return false;
      if (subTab === "Returns" && r.type !== "RETURN") return false;
    }
    
    const matchSearch = !q
      || r.reference.toLowerCase().includes(q)
      || (r.product_name && r.product_name.toLowerCase().includes(q))
      || (r.invoice_number && r.invoice_number.toLowerCase().includes(q))
      || (r.return_number && r.return_number.toLowerCase().includes(q))
      || r.requested_by_name.toLowerCase().includes(q);
    
    return matchSearch;
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
              placeholder="Search reference, product, invoice, user…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400 text-gray-800"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {mainTab === "History" && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 bg-gray-50 border-gray-200 text-gray-700 h-10">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                {["Type", "Reference", "Product/Transaction", "Requested By", "Date", "Diff/Amount", "Reason", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left py-3.5 px-5 font-semibold text-gray-600 text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="py-20 text-center">
                  <div className="flex items-center justify-center gap-2 text-gray-400">
                    <span className="h-4 w-4 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <Search className="h-6 w-6 text-gray-400" />
                    </div>
                    <p className="font-semibold text-gray-700">
                      {hasFilters ? "No requests match your search" : "No requests found"}
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
                <tr key={`${r.type}-${r.id}`} className="hover:bg-blue-50/40 transition-colors">
                  <td className="py-3.5 px-5"><TypeBadge type={r.type} /></td>
                  <td className="py-3.5 px-5">
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">{r.reference}</span>
                  </td>
                  <td className="py-3.5 px-5 font-medium text-gray-900">
                    {r.product_name || r.invoice_number || r.return_number || "—"}
                  </td>
                  <td className="py-3.5 px-5 text-sm text-gray-600">{r.requested_by_name}</td>
                  <td className="py-3.5 px-5 text-sm text-gray-500">{fmtDate(r.created_at || r.prepared_at)}</td>
                  <td className="py-3.5 px-5 font-bold text-gray-900 tabular-nums">
                    {r.difference !== undefined
                      ? (() => {
                          const isWeighted = r.quantity_type === "WEIGHTED";
                          const displayDiff = isWeighted ? r.difference.toFixed(3) : Math.round(r.difference);
                          return displayDiff;
                        })()
                      : r.amount !== undefined ? fmtPeso(r.amount) : "—"}
                  </td>
                  <td className="py-3.5 px-5 text-sm text-gray-600 max-w-[150px] truncate">{r.reason}</td>
                  <td className="py-3.5 px-5"><StatusBadge status={r.status} /></td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setDetailReq(r)}
                        className="h-7 px-3 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        Review
                      </button>
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
              {hasFilters ? `${filtered.length} of ${rows.length}` : rows.length} request{rows.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-400">Isra Hardware POS</p>
          </div>
        )}
      </div>

      <DetailDialog
        req={detailReq}
        onClose={() => setDetailReq(null)}
        onApprove={(type, id) => handleApprove(type, id)}
        onReject={(type, id) => { setDetailReq(null); setRejectTarget({ type, id }); }}
        actionLoading={actionLoading}
      />
      <RejectDialog
        open={rejectTarget != null}
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
        loading={actionLoading}
      />
    </>
  );
}

// ─── Main Requests Page ───────────────────────────────────────────────────────

const MAIN_TABS: MainTabKey[] = ["Pending Requests", "History"];
const SUB_TABS: SubTabKey[] = ["All", "Stock Count", "Void", "Returns", "Market-Based"];

export default function Requests() {
  const [activeMainTab, setActiveMainTab] = useState<MainTabKey>("Pending Requests");
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>("All");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-gray-900">Requests</h1>
        <p className="text-gray-600 mt-1">Review and process all system approval requests</p>
      </div>

      {/* Main tab row */}
      <div className="flex gap-1 border-b border-gray-200">
        {MAIN_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveMainTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeMainTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Sub-tab row for Pending Requests */}
      {activeMainTab === "Pending Requests" && (
        <div className="flex gap-1 border-b border-gray-200">
          {SUB_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeSubTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <RequestsList mainTab={activeMainTab} subTab={activeSubTab} />
    </div>
  );
}
