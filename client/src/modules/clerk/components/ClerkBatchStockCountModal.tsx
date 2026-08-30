import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  authorizeStockCountBatch,
  getBatchRequestDetails,
  submitStockCountBatch,
  type StockCountBatchItemPayload,
} from "@/shared/api/requestsApi";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Package,
  Send,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface BatchStockCountItem {
  productId: number;
  productName: string;
  barcode: string;
  unit: string;
  quantity_type?: string;
  unit_allow_decimal?: boolean;
  systemQty: number;
  physicalCount: string;
  reason: string;
  remarks: string;
  is_market: boolean;
}

interface ClerkBatchStockCountModalProps {
  open: boolean;
  onClose: () => void;
  items: BatchStockCountItem[];
  onApproved: (adminName: string, approvedProductIds: number[], rejectedProductIds?: number[]) => void;
}

type ApprovalMethod = "remote" | "local";
type ModalStatus = "idle" | "pending" | "approved";

export default function ClerkBatchStockCountModal({
  open,
  onClose,
  items,
  onApproved,
}: ClerkBatchStockCountModalProps) {
  const [method, setMethod] = useState<ApprovalMethod | null>(null);
  const [status, setStatus] = useState<ModalStatus>("idle");
  const [adminName, setAdminName] = useState("");
  const [batchReference, setBatchReference] = useState<string | null>(null);

  // Remote submission loading
  const [isSubmittingRemote, setIsSubmittingRemote] = useState(false);

  // Local override state
  const [managerUsername, setManagerUsername] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isOverriding, setIsOverriding] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setMethod(null);
      setStatus("idle");
      setAdminName("");
      setBatchReference(null);
      setIsSubmittingRemote(false);
      setManagerUsername("");
      setManagerPassword("");
      setShowPassword(false);
      setLocalError(null);
      setIsOverriding(false);
    }
  }, [open]);

  // ── Remote Realtime Listener & Polling Fallback ─────────────────────────────
  useEffect(() => {
    if (!open || status !== "pending" || !batchReference) return;

    let isResolved = false;

    const handleSuccess = (approver: string, approvedIds?: number[], rejectedIds?: number[]) => {
      if (isResolved || !mountedRef.current) return;
      isResolved = true;
      setAdminName(approver);
      setStatus("approved");

      const allIds = items.map((i) => i.productId);
      const finalApproved = approvedIds && approvedIds.length > 0 ? approvedIds : allIds;

      toast.success(`Stock count session reviewed by ${approver}!`, { duration: 4000 });

      setTimeout(() => {
        if (!mountedRef.current) return;
        onApproved(approver, finalApproved, rejectedIds);
        onClose();
      }, 1400);
    };

    const handleRejection = (reason?: string | null) => {
      if (isResolved || !mountedRef.current) return;
      isResolved = true;
      const msg = reason ? `Stock count request rejected: ${reason}` : "Stock count request was rejected by Administrator.";
      toast.error(msg, { duration: 5000 });
      setStatus("idle");
      setMethod(null);
      onClose();
    };

    // 1. WebSocket Event Listener
    const handleWsDecision = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const data = customEvent.detail;
      if (!data) return;

      // Match by reference
      if (data.reference && data.reference === batchReference) {
        if (data.decision === "approved") {
          handleSuccess(data.admin_name || "Admin");
        } else if (data.decision === "rejected") {
          handleRejection(data.rejection_reason);
        }
      }
    };

    window.addEventListener("request_decision", handleWsDecision);

    // 2. Fast Polling Fallback (every 2.5s)
    const pollTimer = setInterval(async () => {
      if (isResolved || !mountedRef.current) return;
      try {
        const batch = await getBatchRequestDetails(batchReference);
        if (batch) {
          if (batch.status === "APPROVED" || batch.status === "PARTIALLY_APPROVED") {
            const approvedIds: number[] = [];
            const rejectedIds: number[] = [];
            batch.items.forEach((it: any) => {
              if (it.status === "APPROVED") approvedIds.push(it.product_id);
              else if (it.status === "REJECTED") rejectedIds.push(it.product_id);
            });
            handleSuccess(batch.items[0]?.approved_by_name || "Admin", approvedIds, rejectedIds);
          } else if (batch.status === "REJECTED") {
            handleRejection(batch.items[0]?.rejection_reason || "All items rejected");
          }
        }
      } catch {
        // Polling retry
      }
    }, 2500);

    return () => {
      window.removeEventListener("request_decision", handleWsDecision);
      clearInterval(pollTimer);
    };
  }, [open, status, batchReference, items, onApproved, onClose]);

  // ── Handle Remote Submission ────────────────────────────────────────────────
  const handleSendRemote = async () => {
    setIsSubmittingRemote(true);
    try {
      const batchItems: StockCountBatchItemPayload[] = items.map((i) => ({
        product_id: i.productId,
        system_quantity: i.systemQty,
        physical_quantity: parseFloat(i.physicalCount),
        reason: i.reason,
        remarks: i.remarks || undefined,
        is_market_based: i.is_market,
      }));

      const res = await submitStockCountBatch({ items: batchItems });
      setBatchReference(res.reference);
      setStatus("pending");
      toast.info(`Stock count request sent to Admin terminal (${items.length} items). Waiting for review...`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to send batch request to admin.");
    } finally {
      setIsSubmittingRemote(false);
    }
  };

  // ── Handle Local In-Terminal Override ─────────────────────────────────────────
  const handleLocalOverride = async () => {
    if (!managerUsername.trim() || !managerPassword.trim()) {
      setLocalError("Please enter both username and password.");
      return;
    }
    setLocalError(null);
    setIsOverriding(true);
    try {
      const batchItems: StockCountBatchItemPayload[] = items.map((i) => ({
        product_id: i.productId,
        system_quantity: i.systemQty,
        physical_quantity: parseFloat(i.physicalCount),
        reason: i.reason,
        remarks: i.remarks || undefined,
        is_market_based: i.is_market,
      }));

      const res = await authorizeStockCountBatch(
        { items: batchItems },
        { username: managerUsername.trim(), password: managerPassword }
      );

      setStatus("approved");
      setAdminName(res.admin_name);
      toast.success(`Batch adjustment authorized by ${res.admin_name}!`);

      setTimeout(() => {
        onApproved(
          res.admin_name,
          items.map((i) => i.productId)
        );
        onClose();
      }, 1000);
    } catch (err: any) {
      setLocalError(err?.response?.data?.message ?? "Authorization failed. Check credentials.");
    } finally {
      setIsOverriding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && status !== "pending") onClose(); }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col gap-0 overflow-hidden border border-slate-200 shadow-2xl rounded-2xl">
        <DialogTitle className="sr-only">Authorize Stock Count Session</DialogTitle>

        {/* Dynamic Header */}
        <DialogHeader
          className={`px-6 py-4 transition-colors shrink-0 ${
            status === "approved"
              ? "bg-emerald-600 text-white"
              : status === "pending"
              ? "bg-amber-500 text-white"
              : "bg-gradient-to-r from-purple-700 to-indigo-700 text-white"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/15 backdrop-blur-sm">
              {status === "approved" ? (
                <CheckCircle className="h-6 w-6 text-white" />
              ) : status === "pending" ? (
                <Clock className="h-6 w-6 text-white animate-pulse" />
              ) : (
                <Package className="h-6 w-6 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {status === "approved"
                  ? "Stock Count Authorized!"
                  : status === "pending"
                  ? "Waiting for Admin Review"
                  : `Authorize Stock Count Session (${items.length} Product${items.length > 1 ? "s" : ""})`}
              </h2>
              <p className="text-xs text-white/80 mt-0.5">
                {status === "approved"
                  ? `Authorized by ${adminName}`
                  : status === "pending"
                  ? "Admin will review and approve/reject the count items on their terminal"
                  : "Variance detected on counted items. Choose authorization method to proceed."}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto bg-slate-50/50">
          {/* Discrepancy Summary Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200/80 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Count Discrepancies</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                {items.length} Item{items.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3 text-center">System Qty</th>
                    <th className="py-2 px-3 text-center">Physical Qty</th>
                    <th className="py-2 px-3 text-center">Diff</th>
                    <th className="py-2 px-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => {
                    const diff = parseFloat(it.physicalCount) - it.systemQty;
                    const isPositive = diff > 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-800 leading-tight">{it.productName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{it.barcode}</p>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                          {it.systemQty} {it.unit}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                          {it.physicalCount} {it.unit}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded font-extrabold text-[11px] ${
                              isPositive
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {isPositive ? `+${diff}` : String(diff)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="font-medium text-slate-700">{it.reason}</p>
                          {it.remarks && <p className="text-[10px] text-slate-400 italic line-clamp-1">{it.remarks}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* STATUS: APPROVED */}
          {status === "approved" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center space-y-2 animate-in fade-in zoom-in-95">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-emerald-900">Batch Stock Count Completed!</h3>
              <p className="text-xs text-emerald-700">
                Authorized by <span className="font-bold">{adminName}</span>. System stock has been updated.
              </p>
            </div>
          )}

          {/* STATUS: PENDING (Waiting for remote Admin) */}
          {status === "pending" && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-5 text-center space-y-3 animate-in fade-in">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-900">Waiting for Admin Decision…</h3>
                <p className="text-xs text-amber-700 mt-1 max-w-sm mx-auto">
                  The batch stock count request is now visible on the Admin terminal under <strong>Pending Requests</strong>. The admin can approve all or specific items.
                </p>
              </div>
              {batchReference && (
                <div className="inline-block px-3 py-1 bg-amber-100/80 border border-amber-300 text-amber-900 font-mono text-xs font-bold rounded-lg">
                  Ref: {batchReference}
                </div>
              )}
            </div>
          )}

          {/* STATUS: IDLE (Choose method) */}
          {status === "idle" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select Authorization Method</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Remote option */}
                <button
                  type="button"
                  onClick={() => {
                    setMethod("remote");
                    setLocalError(null);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    method === "remote"
                      ? "border-purple-500 bg-purple-50/60 ring-2 ring-purple-200"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${method === "remote" ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                      <Send className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Send to Admin Terminal</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Submit full request for remote review</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-purple-700 font-medium mt-3 block">
                    Admin can approve all, reject all, or selectively approve items.
                  </span>
                </button>

                {/* Local override option */}
                <button
                  type="button"
                  onClick={() => {
                    setMethod("local");
                    setLocalError(null);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    method === "local"
                      ? "border-purple-500 bg-purple-50/60 ring-2 ring-purple-200"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${method === "local" ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">In-Terminal Override</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Manager authorizes on this screen</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium mt-3 block">
                    Requires Admin/Manager username & password.
                  </span>
                </button>
              </div>

              {/* Local credentials input */}
              {method === "local" && (
                <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <KeyRound className="h-4 w-4 text-purple-600" />
                    <span>Manager Credentials</span>
                  </div>

                  {localError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{localError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Username</label>
                      <Input
                        type="text"
                        placeholder="Admin username"
                        value={managerUsername}
                        onChange={(e) => setManagerUsername(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Password</label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Admin password"
                          value={managerPassword}
                          onChange={(e) => setManagerPassword(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleLocalOverride();
                            }
                          }}
                          className="h-9 text-xs pr-8"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={status === "pending" || isSubmittingRemote || isOverriding}
            className="text-slate-600"
          >
            {status === "pending" ? "Dismiss Window" : "Cancel"}
          </Button>

          {status === "idle" && method === "remote" && (
            <Button
              onClick={handleSendRemote}
              disabled={isSubmittingRemote}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              {isSubmittingRemote && <Loader2 className="h-4 w-4 animate-spin" />}
              <Send className="h-4 w-4" />
              {isSubmittingRemote ? "Submitting Request…" : "Send Batch Request to Admin"}
            </Button>
          )}

          {status === "idle" && method === "local" && (
            <Button
              onClick={handleLocalOverride}
              disabled={isOverriding || !managerUsername.trim() || !managerPassword.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              {isOverriding && <Loader2 className="h-4 w-4 animate-spin" />}
              <KeyRound className="h-4 w-4" />
              {isOverriding ? "Verifying…" : "Authorize All Items"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
