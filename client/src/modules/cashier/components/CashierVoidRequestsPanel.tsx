import { Button } from "@/components/ui/button";
import { getMyVoidRequests, type MyVoidRequest } from "@/shared/api/voidApi";
import type { VoidDecisionNotification } from "@/shared/hooks/useReturnNotifications";
import { Ban, CheckCircle2, ChevronLeft, ChevronRight, Clock, RefreshCw, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface Props {
  show: boolean;
  onClose: () => void;
  /** Called by parent when a WS void_decision arrives so the panel can refresh */
  newDecision: VoidDecisionNotification | null;
  onRequestVoid: () => void;
  /** Called when the panel is opened so the parent can mark requests as "viewed" */
  onViewed?: (ids: number[]) => void;
}

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: MyVoidRequest["status"] }) {
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
      <XCircle className="h-3 w-3" /> Rejected
    </span>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function DetailView({ req, onBack }: { req: MyVoidRequest; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b-2 border-gray-300">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="text-xs text-gray-400">·</span>
        <span className="text-xs font-mono font-semibold text-gray-700">{req.invoice_number}</span>
        <span className="ml-auto"><StatusBadge status={req.status} /></span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status banner */}
        {req.status === "approved" && (
          <div className="p-3 bg-green-50 border-2 border-green-300 rounded-lg text-sm text-green-800 space-y-0.5">
            <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Void Approved</p>
            <p className="text-xs">The sale has been voided and inventory has been restored.</p>
            {req.approved_by_name && <p className="text-xs text-green-700">Approved by: <span className="font-semibold">{req.approved_by_name}</span></p>}
            {req.resolved_at && <p className="text-xs text-green-600">{fmtDate(req.resolved_at)}</p>}
          </div>
        )}
        {req.status === "rejected" && (
          <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg text-sm text-red-800 space-y-0.5">
            <p className="font-semibold flex items-center gap-1.5"><XCircle className="h-4 w-4" /> Void Rejected</p>
            {req.rejection_reason && <p className="text-xs">Reason: <span className="font-medium">{req.rejection_reason}</span></p>}
            {req.approved_by_name && <p className="text-xs text-red-700">Rejected by: <span className="font-semibold">{req.approved_by_name}</span></p>}
            {req.resolved_at && <p className="text-xs text-red-600">{fmtDate(req.resolved_at)}</p>}
          </div>
        )}
        {req.status === "pending" && (
          <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-lg text-sm text-amber-800">
            <p className="font-semibold flex items-center gap-1.5"><Clock className="h-4 w-4" /> Awaiting Admin Review</p>
            <p className="text-xs mt-0.5">Your void request has been submitted and is pending approval.</p>
          </div>
        )}

        {/* Sale info */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>Customer</span>
            <span className="font-medium text-gray-900">{req.customer_name}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Submitted</span>
            <span className="text-gray-700">{fmtDate(req.created_at)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Total Amount</span>
            <span className="font-bold text-gray-900">{fmt(req.total_amount)}</span>
          </div>
        </div>

        {/* Items */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Items</p>
          <div className="rounded-lg border-2 border-gray-300 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-300">
                  <th className="text-left py-2 px-3 font-semibold text-gray-600">Product</th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-600">Qty</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-600">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {req.items.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-900">{item.product_name}</td>
                    <td className="py-2 px-2 text-center text-gray-600">
                      {item.quantity}{item.unit ? ` ${item.unit}` : ""}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Void reason */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Void Reason</p>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 border-2 border-gray-300">{req.reason}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function CashierVoidRequestsPanel({ show, onClose, newDecision, onRequestVoid, onViewed }: Props) {
  const [requests, setRequests] = useState<MyVoidRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MyVoidRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyVoidRequests();
      setRequests(data);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  // Load on open and call onViewed to mark as read
  useEffect(() => {
    if (show) {
      load();
      setDetail(null);
    }
  }, [show, load]);

  // Once requests are loaded and panel is visible, mark them all as seen
  useEffect(() => {
    if (show && requests.length > 0 && onViewed) {
      onViewed(requests.map((r) => r.id));
    }
  // We only want to fire when the panel opens or fresh data arrives while open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, requests]);

  // Refresh + update detail when a WS decision arrives
  useEffect(() => {
    if (!newDecision) return;
    load();
    // If the detail view is open for this void, update its status inline
    setDetail((prev) => {
      if (!prev || prev.id !== newDecision.void_id) return prev;
      return {
        ...prev,
        status: newDecision.decision,
        approved_by_name: newDecision.admin_name,
        rejection_reason: newDecision.rejection_reason,
        resolved_at: new Date().toISOString(),
      };
    });
  }, [newDecision, load]);

  useEffect(() => {
    if (!show) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [show, onClose]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const newCount = requests.filter((r) => r.status !== "pending").length;

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        data-drawer="true"
        className="w-96 bg-white h-full shadow-2xl flex flex-col border-l-2 border-gray-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b-2 border-gray-300 bg-white">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm">Void</span>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={load}
              disabled={loading}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {detail ? (
            <DetailView req={detail} onBack={() => setDetail(null)} />
          ) : (
            <div className="h-full overflow-y-auto p-4 space-y-4">
              {/* Request Void Section */}
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Ban className="h-4 w-4 text-red-600" />
                  <h3 className="text-sm font-semibold text-red-900">Request Void</h3>
                </div>
                <p className="text-xs text-red-700 mb-3">Submit a void request for the current sale.</p>
                <Button
                  size="sm"
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  onClick={onRequestVoid}
                >
                  <Ban className="h-4 w-4 mr-2" /> Request Void
                </Button>
              </div>

              {/* Void Requests List */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">My Void Requests</p>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
                    <span className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : requests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                    <Clock className="h-10 w-10 opacity-30" />
                    <p className="text-sm font-medium">No void requests yet</p>
                    <p className="text-xs text-center px-8">Void requests you submit will appear here with their approval status.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {requests.map((req) => (
                      <button
                        key={req.id}
                        onClick={() => setDetail(req)}
                        className="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors flex items-start gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-mono text-xs font-semibold text-gray-800 truncate">
                              {req.invoice_number}
                            </span>
                            <StatusBadge status={req.status} />
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{req.items.length} item{req.items.length !== 1 ? "s" : ""}</span>
                          <span className="font-semibold text-gray-800">{fmt(req.total_amount)}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(req.created_at)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-1" />
                    </button>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
