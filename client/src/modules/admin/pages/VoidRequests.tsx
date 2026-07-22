import { useState, useEffect, useCallback } from "react";
import { Search, X, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getVoidRequests, approveVoid, rejectVoid } from "@/shared/api/voidApi";
import type { VoidRequest } from "@/shared/api/voidApi";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TabKey = "Pending" | "All Requests";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtPeso(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: VoidRequest["status"] }) {
  if (status === "pending")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Pending</span>;
  if (status === "approved")
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
        <DialogHeader><DialogTitle>Reject Void Request</DialogTitle></DialogHeader>
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
  req: VoidRequest | null;
  onClose: () => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  actionLoading: boolean;
}

function DetailDialog({ req, onClose, onApprove, onReject, actionLoading }: DetailDialogProps) {
  if (!req) return null;
  return (
    <Dialog open={!!req} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Void Request Details</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><span className="text-gray-500">Invoice #:</span> <span className="font-mono font-semibold">{req.invoice_number}</span></div>
            <div><span className="text-gray-500">Status:</span> <StatusBadge status={req.status} /></div>
            <div><span className="text-gray-500">Customer:</span> {req.customer_name}</div>
            <div><span className="text-gray-500">Sale Amount:</span> <span className="font-semibold">{fmtPeso(req.total_amount)}</span></div>
            <div><span className="text-gray-500">Requested By:</span> {req.requested_by_name}</div>
            <div><span className="text-gray-500">Requested:</span> {fmtDate(req.created_at)}</div>
            {req.approved_by_name && (
              <div><span className="text-gray-500">Resolved By:</span> {req.approved_by_name}</div>
            )}
            {req.resolved_at && (
              <div><span className="text-gray-500">Resolved:</span> {fmtDate(req.resolved_at)}</div>
            )}
          </div>
          <div className="p-3 bg-gray-50 rounded text-sm">
            <span className="text-gray-500">Void Reason: </span>{req.reason}
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
            Approving a void marks the sale as voided. The original transaction record is preserved and cannot be deleted.
          </div>
        </div>
        <DialogFooter className="gap-2 flex-wrap">
          {req.status === "pending" && (
            <>
              <Button variant="outline" className="text-red-600 border-red-300" onClick={() => onReject(req.id)} disabled={actionLoading}>Reject</Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => onApprove(req.id)} disabled={actionLoading}>
                {actionLoading ? "Processing…" : "Approve Void"}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Void Requests List ───────────────────────────────────────────────────────

function VoidRequestsList({ tab }: { tab: TabKey }) {
  const [rows, setRows] = useState<VoidRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [detailReq, setDetailReq] = useState<VoidRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVoidRequests();
      setRows(tab === "Pending" ? data.filter((r) => r.status === "pending") : data);
    } catch {
      toast.error("Failed to load void requests.");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSearch(""); setFilterStatus("all"); }, [tab]);

  const handleApprove = async (voidId: number) => {
    setActionLoading(true);
    try {
      await approveVoid(voidId);
      toast.success("Void approved. Sale has been marked as voided.");
      setDetailReq(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to approve void.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await rejectVoid(rejectTarget, reason);
      toast.success("Void request rejected.");
      setRejectTarget(null);
      setDetailReq(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to reject void.");
    } finally {
      setActionLoading(false);
    }
  };

  const q = search.toLowerCase();
  const filtered = rows.filter((r) => {
    const matchSearch = !q
      || r.invoice_number.toLowerCase().includes(q)
      || r.customer_name.toLowerCase().includes(q)
      || r.requested_by_name.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
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
              placeholder="Search invoice #, customer, requested by…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-gray-400 text-gray-800"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {tab === "All Requests" && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40 bg-gray-50 border-gray-200 text-gray-700 h-10">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
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

      {/* Notice */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700">
          Approving a void marks the sale as voided for reporting purposes. The original transaction record is always preserved and cannot be deleted.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-200">
                {["Invoice #", "Customer", "Sale Amount", "Requested By", "Date Requested", "Status", "Actions"].map((h) => (
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
                      {hasFilters ? "No requests match your search" : tab === "Pending" ? "No pending void requests" : "No void requests found"}
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
                    <span className="font-mono text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1 rounded">{r.invoice_number}</span>
                  </td>
                  <td className="py-3.5 px-5 font-medium text-gray-900">{r.customer_name}</td>
                  <td className="py-3.5 px-5 font-bold text-gray-900 tabular-nums">{fmtPeso(r.total_amount)}</td>
                  <td className="py-3.5 px-5 text-sm text-gray-600">{r.requested_by_name}</td>
                  <td className="py-3.5 px-5 text-sm text-gray-500">{fmtDate(r.created_at)}</td>
                  <td className="py-3.5 px-5"><StatusBadge status={r.status} /></td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setDetailReq(r)}
                        className="h-7 px-3 text-xs font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        View
                      </button>
                      {r.status === "pending" && (
                        <>
                          <button
                            disabled={actionLoading}
                            onClick={() => handleApprove(r.id)}
                            className="h-7 px-3 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            disabled={actionLoading}
                            onClick={() => setRejectTarget(r.id)}
                            className="h-7 px-3 text-xs font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
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
              {hasFilters ? `${filtered.length} of ${rows.length}` : rows.length} request{rows.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-gray-400">Isra Hardware POS</p>
          </div>
        )}
      </div>

      <DetailDialog
        req={detailReq}
        onClose={() => setDetailReq(null)}
        onApprove={(id) => handleApprove(id)}
        onReject={(id) => { setDetailReq(null); setRejectTarget(id); }}
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

// ─── Main Void Requests Page ──────────────────────────────────────────────────

const TABS: TabKey[] = ["Pending", "All Requests"];

export default function VoidRequests() {
  const [activeTab, setActiveTab] = useState<TabKey>("Pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-gray-900">Void Requests</h1>
        <p className="text-gray-600 mt-1">Review and process sale void requests</p>
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

      {activeTab === "Pending" && <VoidRequestsList tab="Pending" />}
      {activeTab === "All Requests" && <VoidRequestsList tab="All Requests" />}
    </div>
  );
}
