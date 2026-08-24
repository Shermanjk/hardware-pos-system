import { useState, useEffect, useCallback } from "react";
import { Search, X, RefreshCw, AlertCircle, Package, Ban, RotateCcw, XCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getPendingRequests, getRequestHistory, approveRequest, approveReturnRequest, rejectRequest, type UnifiedRequest } from "@/shared/api/requestsApi";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import { toast } from "sonner";
import { formatQuantityParts } from "@/shared/utils/quantityFormat";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

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
  // A return approved by Admin waits for cashier execution under the
  // `waiting_for_cashier` workflow status. It is still an approved request.
  if (s === "APPROVED" || s === "WAITING_FOR_CASHIER")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Approved</span>;
  if (s === "COMPLETED")
    return <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Completed</span>;
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
      <DialogContent className="max-w-sm p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Reject Request</DialogTitle>
        {/* Red header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-400 rounded-t-lg">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <XCircle className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Reject Request</h2>
            <p className="text-xs text-red-100 mt-0.5">Provide a reason for rejecting this request</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          <Label className="font-semibold">Rejection Reason <span className="text-red-500">*</span></Label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason for rejection…"
            rows={3}
            disabled={loading}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 disabled:opacity-50"
          />
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            disabled={loading || !reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            {loading && <LoadingSpinner size={16} className="text-white" />}
            {loading ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Return Approval Dialog ─────────────────────────────────────────────────────

interface ReturnApprovalDialogProps {
  open: boolean;
  req: UnifiedRequest | null;
  onConfirm: (payload: {
    resolution: "refund" | "exchange" | "store_credit" | "rejected";
    exchange_barcode?: string;
    exchange_quantity?: number;
    additional_payment?: number;
    refund_difference?: number;
    rejection_reason?: string;
  }) => void;
  onCancel: () => void;
  loading: boolean;
}

function ReturnApprovalDialog({ open, req, onConfirm, onCancel, loading }: ReturnApprovalDialogProps) {
  const [resolution, setResolution] = useState<"refund" | "exchange" | "store_credit" | "rejected">("refund");
  const [exchangeBarcode, setExchangeBarcode] = useState<string | undefined>();
  const [exchangeQuantity, setExchangeQuantity] = useState<number | undefined>();
  const [additionalPayment, setAdditionalPayment] = useState<number | undefined>();
  const [refundDifference, setRefundDifference] = useState<number | undefined>();
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    if (!open) {
      setResolution("refund");
      setExchangeBarcode(undefined);
      setExchangeQuantity(undefined);
      setAdditionalPayment(undefined);
      setRefundDifference(undefined);
      setRejectionReason("");
    }
  }, [open]);

  const handleConfirm = () => {
    if (resolution === "rejected" && !rejectionReason.trim()) {
      toast.error("Rejection requires a reason.");
      return;
    }
    if (resolution === "exchange" && (!exchangeBarcode || !exchangeQuantity)) {
      toast.error("Exchange requires barcode and quantity.");
      return;
    }
    onConfirm({
      resolution,
      exchange_barcode: exchangeBarcode,
      exchange_quantity: exchangeQuantity,
      additional_payment: additionalPayment,
      refund_difference: refundDifference,
      rejection_reason: rejectionReason || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Approve Return</DialogTitle>
        {/* Green header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-green-500 rounded-t-lg">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Approve Return</h2>
            <p className="text-xs text-green-100 mt-0.5">Select the resolution for this return</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          {req && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div><span className="text-gray-500">Return #:</span> <span className="font-mono font-semibold">{req.return_number}</span></div>
              <div><span className="text-gray-500">Invoice #:</span> <span className="font-mono font-semibold">{req.invoice_number ? req.invoice_number.replace(/^INV-?/i, "") : "—"}</span></div>
              <div><span className="text-gray-500">Customer:</span> <span className="font-medium">{req.customer_name}</span></div>
              <div><span className="text-gray-500">Amount:</span> <span className="font-bold text-emerald-700">{fmtPeso(req.amount || 0)}</span></div>
            </div>
          )}
          <div>
            <Label className="font-semibold mb-2 block">Resolution <span className="text-red-500">*</span></Label>
            <Select value={resolution} onValueChange={(v: any) => setResolution(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="refund">💰 Refund</SelectItem>
                <SelectItem value="exchange">🔄 Exchange</SelectItem>
                <SelectItem value="store_credit">💳 Store Credit</SelectItem>
                <SelectItem value="rejected">❌ Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {resolution === "exchange" && (
            <div className="space-y-3">
              <div>
                <Label className="font-semibold mb-1 block">Exchange Barcode</Label>
                <Input
                  type="text"
                  value={exchangeBarcode || ""}
                  onChange={(e) => setExchangeBarcode(e.target.value || undefined)}
                  placeholder="Enter barcode"
                />
              </div>
              <div>
                <Label className="font-semibold mb-1 block">Exchange Quantity</Label>
                <Input
                  type="number"
                  value={exchangeQuantity || ""}
                  onChange={(e) => setExchangeQuantity(Number(e.target.value) || undefined)}
                  placeholder="Enter quantity"
                />
              </div>
              <div>
                <Label className="font-semibold mb-1 block">Additional Payment (₱)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={additionalPayment || ""}
                  onChange={(e) => setAdditionalPayment(Number(e.target.value) || undefined)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label className="font-semibold mb-1 block">Refund Difference (₱)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={refundDifference || ""}
                  onChange={(e) => setRefundDifference(Number(e.target.value) || undefined)}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
          {resolution === "rejected" && (
            <div>
              <Label className="font-semibold mb-1 block">Rejection Reason <span className="text-red-500">*</span></Label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection…"
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400"
              />
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            disabled={loading}
            onClick={handleConfirm}
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
          >
            {loading && <LoadingSpinner size={16} className="text-white" />}
            {loading ? "Approving…" : "Approve"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

interface DetailDialogProps {
  req: UnifiedRequest | null;
  onClose: () => void;
  onApprove: (type: string, id: number) => void;
  onApproveReturn: (id: number, payload: any) => void;
  onReject: (type: string, id: number) => void;
  actionLoading: boolean;
}

function DetailDialog({ req, onClose, onApprove, onApproveReturn, onReject, actionLoading }: DetailDialogProps) {
  if (!req) return null;
  
  const isPending = req.status.toLowerCase() === "pending" || req.status === "PENDING_APPROVAL";
  const typeMap: Record<string, string> = {
    "STOCK_COUNT_STANDARD": "stock-count-standard",
    "STOCK_COUNT_MARKET": "stock-count-market",
    "VOID": "void",
    "RETURN": "return",
  };

  // Dynamic header config per type
  const headerConfig = req.type.startsWith("STOCK_COUNT")
    ? { bg: "bg-slate-500", icon: <Package className="h-5 w-5 text-white" />, title: req.type === "STOCK_COUNT_MARKET" ? "Market-Based Stock Count" : "Stock Count Request" }
    : req.type === "VOID"
    ? { bg: "bg-slate-500", icon: <Ban className="h-5 w-5 text-white" />, title: "Void Request" }
    : { bg: "bg-slate-500", icon: <RotateCcw className="h-5 w-5 text-white" />, title: "Return Request" };

  return (
    <Dialog open={!!req} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col gap-0 overflow-hidden max-h-[90vh]">
        <DialogTitle className="sr-only">{headerConfig.title}</DialogTitle>
        {/* Slate header */}
        <div className={`flex items-center gap-3 px-6 py-4 ${headerConfig.bg} rounded-t-lg shrink-0`}>
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            {headerConfig.icon}
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{headerConfig.title}</h2>
            <p className="text-xs text-slate-300 mt-0.5 font-mono">{req.reference}</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Request Info */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Request Info</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center gap-1.5"><span className="text-gray-500">Type:</span> <TypeBadge type={req.type} /></div>
              <div><span className="text-gray-500">Reference:</span> <span className="font-mono font-semibold text-gray-800 ml-1">{req.reference}</span></div>
              <div><span className="text-gray-500">Requested By:</span> <span className="font-medium text-gray-800 ml-1">{req.requested_by_name}</span></div>
              <div><span className="text-gray-500">Date:</span> <span className="text-gray-800 ml-1">{fmtDate(req.created_at || req.prepared_at)}</span></div>
              <div className="flex items-center gap-1.5"><span className="text-gray-500">Status:</span> <span className="ml-1"><StatusBadge status={req.status} /></span></div>
            </div>
          </div>

          {/* Reason */}
          <div className="p-3 bg-gray-50 rounded-lg text-sm border border-gray-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Reason</p>
            <p className="text-gray-800">{req.reason}</p>
          </div>

          {/* Remarks */}
          {req.remarks && (
            <div className="p-3 bg-gray-50 rounded-lg text-sm border border-gray-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Remarks</p>
              <p className="text-gray-800">{req.remarks}</p>
            </div>
          )}

          {/* Type-specific details */}
          {req.type.startsWith("STOCK_COUNT") && (
            <div className="p-4 bg-blue-50 rounded-lg text-sm border border-blue-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-3">Inventory Details</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><span className="text-gray-500">Product:</span> <span className="font-semibold text-gray-900 ml-1">{req.product_name}</span></div>
                <div><span className="text-gray-500">Barcode:</span> <span className="font-mono text-gray-700 ml-1">{req.barcode}</span></div>
                <div><span className="text-gray-500">System Qty:</span> <span className="font-semibold text-gray-900 ml-1">{(() => {
                  const allowDecimal = req.unit_allow_decimal ?? req.quantity_type === "WEIGHTED";
                  return allowDecimal ? req.system_quantity?.toFixed(3) : req.system_quantity;
                })()}</span></div>
                <div><span className="text-gray-500">Physical Qty:</span> <span className="font-semibold text-gray-900 ml-1">{(() => {
                  const allowDecimal = req.unit_allow_decimal ?? req.quantity_type === "WEIGHTED";
                  return allowDecimal ? req.physical_quantity?.toFixed(3) : req.physical_quantity;
                })()}</span></div>
                <div><span className="text-gray-500">Difference:</span> <span className={`font-bold ml-1 ${req.difference && req.difference > 0 ? "text-blue-600" : "text-red-600"}`}>{(() => {
                  const allowDecimal = req.unit_allow_decimal ?? req.quantity_type === "WEIGHTED";
                  const displayDiff = allowDecimal ? req.difference?.toFixed(3) : Math.round(req.difference || 0);
                  return `${Number(displayDiff) > 0 ? "+" : ""}${displayDiff}`;
                })()}</span></div>
              </div>
            </div>
          )}

          {req.type === "VOID" && (
            <div className="p-4 bg-red-50 rounded-lg text-sm border border-red-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-3">Transaction Details</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><span className="text-gray-500">Invoice #:</span> <span className="font-mono font-semibold text-gray-900 ml-1">{req.invoice_number ? req.invoice_number.replace(/^INV-?/i, "") : "—"}</span></div>
                <div><span className="text-gray-500">Amount:</span> <span className="font-bold text-gray-900 ml-1">{fmtPeso(req.amount || 0)}</span></div>
                <div><span className="text-gray-500">Customer:</span> <span className="font-medium text-gray-800 ml-1">{req.customer_name || "N/A"}</span></div>
              </div>
            </div>
          )}

          {req.type === "RETURN" && (
            <div className="p-4 bg-green-50 rounded-lg text-sm border border-green-200">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-3">Return Details</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div><span className="text-gray-500">Return #:</span> <span className="font-mono font-semibold text-gray-900 ml-1">{req.return_number}</span></div>
                <div><span className="text-gray-500">Invoice #:</span> <span className="font-mono font-semibold text-gray-900 ml-1">{req.invoice_number ? req.invoice_number.replace(/^INV-?/i, "") : "—"}</span></div>
                <div><span className="text-gray-500">Product:</span> <span className="font-medium text-gray-800 ml-1">{req.product_name}</span></div>
                <div><span className="text-gray-500">Barcode:</span> <span className="font-mono text-gray-700 ml-1">{req.barcode}</span></div>
                <div><span className="text-gray-500">Qty Returned:</span> <span className="font-semibold text-gray-900 ml-1">{req.physical_quantity}</span></div>
                <div><span className="text-gray-500">Unit Price:</span> <span className="font-semibold text-gray-900 ml-1">{fmtPeso(req.unit_price || 0)}</span></div>
                <div><span className="text-gray-500">Refund Amount:</span> <span className="font-bold text-emerald-700 ml-1">{fmtPeso(req.amount || 0)}</span></div>
                <div><span className="text-gray-500">Customer:</span> <span className="font-medium text-gray-800 ml-1">{req.customer_name || "N/A"}</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2 shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {isPending && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="text-red-600 border-red-300 hover:bg-red-50"
                onClick={() => onReject(typeMap[req.type], req.id)}
                disabled={actionLoading}
              >
                <XCircle className="h-4 w-4 mr-1.5" /> Reject
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
                onClick={() => {
                  if (req.type === "RETURN") {
                    onApproveReturn(req.id, {});
                  } else {
                    onApprove(typeMap[req.type], req.id);
                  }
                }}
                disabled={actionLoading}
              >
                {actionLoading && <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />}
                <CheckCircle2 className="h-4 w-4" />
                {actionLoading ? "Processing…" : "Approve"}
              </Button>
            </div>
          )}
        </div>
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
  const [returnApprovalTarget, setReturnApprovalTarget] = useState<UnifiedRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let data: UnifiedRequest[];
      if (mainTab === "Pending Requests") {
        data = await getPendingRequests();
      } else {
        // BUG-10 FIX: "Stock Count" sub-tab must map to "STOCK_COUNT_STANDARD", not undefined
        const typeFilter = subTab === "All" ? undefined :
          subTab === "Stock Count" ? "STOCK_COUNT_STANDARD" :
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

  // Real-time zero-refresh sync: when any request is submitted, approved, or rejected
  useRealtimeSync(["requests", "returns", "discounts", "sales"], load);

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

  const handleApproveReturn = async (payload: any) => {
    if (!returnApprovalTarget) return;
    setActionLoading(true);
    try {
      await approveReturnRequest(returnApprovalTarget.id, payload);
      toast.success("Return approved.");
      setReturnApprovalTarget(null);
      setDetailReq(null);
      load();
      // Dispatch event to refresh sidebar counts immediately
      window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to approve return.");
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
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-4.5">
        <div className="flex flex-wrap gap-3.5 items-center">
          <div className="flex-1 min-w-56 flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:border-slate-400 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-xs">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, product, invoice, user…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400 text-slate-800 font-medium"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {mainTab === "History" && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44 bg-white border-slate-300 hover:border-slate-400 text-slate-800 h-10 shadow-xs">
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
            className="h-10 w-10 flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {hasFilters && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
              <button
                onClick={() => { setSearch(""); setFilterStatus("all"); }}
                className="text-blue-600 font-bold hover:underline cursor-pointer"
              >Clear</button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Type", "Reference", "Product / Transaction", "Requested By", "Date & Time", "Diff / Amount", "Reason", "Status", "Actions"].map((h, i) => (
                  <th key={h} className={`py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide ${i === 5 ? "text-right" : i === 8 ? "text-center" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <LoadingSpinner size={16} className="text-blue-600" />
                      <span className="text-sm font-medium">Loading approval requests…</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                        <Search className="h-7 w-7 text-slate-400" />
                      </div>
                      <p className="font-bold text-slate-700">
                        {hasFilters ? "No requests match your search" : "No pending requests found"}
                      </p>
                      {hasFilters && (
                        <button
                          onClick={() => { setSearch(""); setFilterStatus("all"); }}
                          className="text-blue-600 text-xs font-bold hover:underline cursor-pointer"
                        >Clear filters</button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : filtered.map((r) => (
                <tr key={`${r.type}-${r.id}`} className={`hover:bg-blue-50/50 transition-colors ${r.status.toUpperCase() === "APPROVED" || r.status === "waiting_for_cashier" ? "bg-emerald-50/50 border-l-4 border-l-emerald-500" : ""}`}>
                  <td className="py-3.5 px-5"><TypeBadge type={r.type} /></td>
                  <td className="py-3.5 px-5">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">{r.reference}</span>
                  </td>
                  <td className="py-3.5 px-5 font-bold text-slate-900">
                    {r.product_name || r.invoice_number || r.return_number || "—"}
                  </td>
                  <td className="py-3.5 px-5 text-sm text-slate-600 font-medium">{r.requested_by_name}</td>
                  <td className="py-3.5 px-5 text-sm text-slate-500">{fmtDate(r.created_at || r.prepared_at)}</td>
                  <td className="py-3.5 px-5 font-bold font-mono text-slate-900 text-right tabular-nums">
                    {r.difference !== undefined
                      ? (() => {
                          const allowDecimal = r.unit_allow_decimal ?? r.quantity_type === "WEIGHTED";
                          const displayDiff = allowDecimal ? r.difference.toFixed(3) : Math.round(r.difference);
                          return displayDiff;
                        })()
                      : r.amount !== undefined ? fmtPeso(r.amount) : "—"}
                  </td>
                  <td className="py-3.5 px-5 text-sm text-slate-600 max-w-[180px] truncate">{r.reason}</td>
                  <td className="py-3.5 px-5"><StatusBadge status={r.status} /></td>
                  <td className="py-3.5 px-5 text-center">
                    <button
                      onClick={() => setDetailReq(r)}
                      className="h-8 px-3.5 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors shadow-2xs cursor-pointer"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-600 font-bold">
              {hasFilters ? `${filtered.length} of ${rows.length}` : rows.length} request{rows.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-slate-400 font-medium">Isra Hardware POS</p>
          </div>
        )}
      </div>

      <DetailDialog
        req={detailReq}
        onClose={() => setDetailReq(null)}
        onApprove={(type, id) => handleApprove(type, id)}
        onApproveReturn={(id, payload) => { setDetailReq(null); setReturnApprovalTarget(detailReq); }}
        onReject={(type, id) => { setDetailReq(null); setRejectTarget({ type, id }); }}
        actionLoading={actionLoading}
      />
      <RejectDialog
        open={!!rejectTarget}
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
        loading={actionLoading}
      />
      <ReturnApprovalDialog
        open={!!returnApprovalTarget}
        req={returnApprovalTarget}
        onConfirm={handleApproveReturn}
        onCancel={() => setReturnApprovalTarget(null)}
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
