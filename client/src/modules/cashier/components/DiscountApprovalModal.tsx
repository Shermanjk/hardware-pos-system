import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import httpClient from "@/shared/api/httpClient";
import { loadToken } from "@/shared/utils/auth";
import {
    AlertTriangle, CheckCircle, Clock,
    Eye, EyeOff,
    KeyRound,
    Loader2, Percent,
    Send,
    XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface DiscountApprovalModalProps {
  open: boolean;
  onClose: () => void;
  discount: { id: number; name: string; percentage: number; requiresApproval: boolean } | null;
  /** Total amount of the current transaction in centavos. */
  totalAmount: number;
  onApproved: (requestId: number) => void;
  onRejected: () => void;
}

type ModalStatus = "idle" | "pending" | "approved" | "rejected";
type ApprovalMethod = "remote" | "local";

export default function DiscountApprovalModal({
  open,
  onClose,
  discount,
  totalAmount,
  onApproved,
  onRejected,
}: DiscountApprovalModalProps) {
  // ── Shared state ───────────────────────────────────────────────────────────
  const [method, setMethod]           = useState<ApprovalMethod | null>(null);
  const [reason, setReason]           = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [status, setStatus]           = useState<ModalStatus>("idle");
  const [adminName, setAdminName]     = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // ── Remote-flow state ──────────────────────────────────────────────────────
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestId, setRequestId]       = useState<number | null>(null);

  // ── Local override state ───────────────────────────────────────────────────
  const [localRequestId, setLocalRequestId]   = useState<number | null>(null);
  const [managerUsername, setManagerUsername] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [showPassword, setShowPassword]       = useState(false);
  const [localError, setLocalError]           = useState<string | null>(null);
  const [isOverriding, setIsOverriding]       = useState(false);

  // Prevent setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset all state when dialog opens
  useEffect(() => {
    if (open) {
      setMethod(null);
      setReason("");
      setReasonError(false);
      setStatus("idle");
      setAdminName("");
      setRejectionReason("");
      setIsRequesting(false);
      setRequestId(null);
      setLocalRequestId(null);
      setManagerUsername("");
      setManagerPassword("");
      setShowPassword(false);
      setLocalError(null);
      setIsOverriding(false);
    }
  }, [open]);

  // ── WebSocket — listen for remote admin decision ───────────────────────────
  useEffect(() => {
    if (!open || status !== "pending" || requestId === null) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      const token = loadToken();
      if (!token) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws?token=${token}`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "discount_decision" && data.request_id === requestId) {
            if (!mountedRef.current) return;
            if (data.decision === "approved") {
              setStatus("approved");
              setAdminName(data.admin_name ?? "Admin");
              toast.success(`Discount approved by ${data.admin_name ?? "Admin"}`, { duration: 5000 });
              setTimeout(() => {
                if (!mountedRef.current) return;
                onApproved(requestId!);
                onClose();
              }, 1500);
            } else {
              setStatus("rejected");
              setAdminName(data.admin_name ?? "Admin");
              setRejectionReason(data.rejection_reason ?? "");
              toast.error(`Discount rejected by ${data.admin_name ?? "Admin"}`, {
                description: data.rejection_reason ?? undefined,
                duration: 5000,
              });
              setTimeout(() => {
                if (!mountedRef.current) return;
                onRejected();
                onClose();
              }, 2500);
            }
          }
        } catch { /* ignore */ }
      };

      ws.onclose = (event) => {
        if (destroyed) return;
        if (event.code === 1008) return;
        reconnectTimeout = setTimeout(() => connect(), 3000);
      };
      ws.onerror = () => {};
    };

    connect();
    return () => {
      destroyed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) { ws.onclose = null; ws.close(); }
    };
  }, [open, status, requestId, onApproved, onRejected, onClose]);

  // ── Derived values ─────────────────────────────────────────────────────────
  if (!discount) return null;

  const discountCents = Math.round((totalAmount * discount.percentage) / 100);
  const finalCents    = totalAmount - discountCents;

  const fmt = (cents: number) =>
    "₱" + (cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Handlers: remote flow ──────────────────────────────────────────────────

  /** Step 1 for remote: create the pending request, move to "pending" state */
  const handleSendToAdmin = async () => {
    const trimmed = reason.trim();
    if (!trimmed) { setReasonError(true); return; }
    setReasonError(false);
    setIsRequesting(true);
    try {
      const response = await httpClient.post("/api/discount-approvals", {
        discount_id:          discount.id,
        requested_percentage: discount.percentage,
        discount_amount:      Math.round(discountCents) / 100,
        reason:               trimmed,
      });
      if (!mountedRef.current) return;
      setRequestId(response.data.id);
      setStatus("pending");
      toast.info("Approval request sent to admin.", { duration: 4000 });
    } catch (err: any) {
      if (!mountedRef.current) return;
      toast.error(err?.response?.data?.message ?? "Failed to send approval request.");
    } finally {
      if (mountedRef.current) setIsRequesting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!requestId) return;
    try {
      await httpClient.delete(`/api/discount-approvals/${requestId}`);
      if (!mountedRef.current) return;
      toast.info("Approval request cancelled.");
      onClose();
    } catch (err: any) {
      if (!mountedRef.current) return;
      toast.error(err?.response?.data?.message ?? "Failed to cancel request.");
    }
  };

  // ── Handlers: local override flow ─────────────────────────────────────────

  /**
   * Step 1 for local: create the pending request first (so there's a
   * discount_requests row to approve), then immediately call local-override.
   * This ensures the same DB record exists for the audit trail and Auth History.
   */
  const handleLocalOverride = async () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) { setReasonError(true); return; }
    if (!managerUsername.trim() || !managerPassword) {
      setLocalError("Manager username and password are required.");
      return;
    }
    setReasonError(false);
    setLocalError(null);
    setIsOverriding(true);

    try {
      // 1. Create the pending discount request record
      let drId = localRequestId;
      if (!drId) {
        const createRes = await httpClient.post("/api/discount-approvals", {
          discount_id:          discount.id,
          requested_percentage: discount.percentage,
          discount_amount:      Math.round(discountCents) / 100,
          reason:               trimmedReason,
        });
        drId = createRes.data.id as number;
        if (mountedRef.current) setLocalRequestId(drId);
      }

      // 2. Approve it immediately via manager override
      const overrideRes = await httpClient.post(
        `/api/discount-approvals/${drId}/local-override`,
        { username: managerUsername.trim(), password: managerPassword }
      );

      if (!mountedRef.current) return;

      const approvedBy: string = overrideRes.data.admin_name ?? "Manager";
      setStatus("approved");
      setAdminName(approvedBy);
      toast.success(`Discount authorized by ${approvedBy}`, { duration: 4000 });

      setTimeout(() => {
        if (!mountedRef.current) return;
        onApproved(drId!);
        onClose();
      }, 1200);
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg: string = err?.response?.data?.message ?? "Authorization failed.";
      setLocalError(msg);
      // Clear password field on failure for security
      setManagerPassword("");
    } finally {
      if (mountedRef.current) setIsOverriding(false);
    }
  };

  // Block accidental close while a remote request is in flight
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && status === "pending") return;
    if (!nextOpen) onClose();
  };

  // ── Transaction summary card (reused in multiple views) ───────────────────
  const TransactionSummary = () => (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-amber-800 mb-1">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-semibold">Admin Approval Required</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Discount:</span>
        <span className="font-semibold">{discount.name} ({discount.percentage}%)</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Discount Amount:</span>
        <span className="font-semibold text-amber-700">-{fmt(discountCents)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Original Total:</span>
        <span className="font-semibold">{fmt(totalAmount)}</span>
      </div>
      <div className="flex justify-between border-t border-amber-200 pt-2">
        <span className="text-gray-700 font-semibold">Final Total:</span>
        <span className="font-bold text-green-700">{fmt(finalCents)}</span>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5 text-amber-600" />
            Discount Approval Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* ── METHOD SELECTION ─────────────────────────────────────────── */}
          {status === "idle" && method === null && (
            <>
              <TransactionSummary />
              <p className="text-sm text-gray-600 font-medium">How would you like to get approval?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMethod("remote")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Send className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-blue-900">Send to Admin Terminal</p>
                    <p className="text-xs text-blue-600 mt-0.5">Admin approves remotely</p>
                  </div>
                </button>
                <button
                  onClick={() => setMethod("local")}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <KeyRound className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-purple-900">Manager Override</p>
                    <p className="text-xs text-purple-600 mt-0.5">Admin signs in here</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* ── REMOTE FORM ───────────────────────────────────────────────── */}
          {status === "idle" && method === "remote" && (
            <>
              <TransactionSummary />
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">
                  Reason <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Enter the reason for requesting this discount…"
                  value={reason}
                  onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setReasonError(false); }}
                  rows={3}
                  className={`resize-none ${reasonError ? "border-red-400 focus:ring-red-200" : ""}`}
                />
                {reasonError && <p className="text-xs text-red-500">A reason is required.</p>}
              </div>
            </>
          )}

          {/* ── LOCAL OVERRIDE FORM ───────────────────────────────────────── */}
          {status === "idle" && method === "local" && (
            <>
              <TransactionSummary />
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">
                    Reason <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    placeholder="Enter the reason for requesting this discount…"
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setReasonError(false); }}
                    rows={2}
                    className={`resize-none ${reasonError ? "border-red-400 focus:ring-red-200" : ""}`}
                  />
                  {reasonError && <p className="text-xs text-red-500">A reason is required.</p>}
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2 text-purple-800">
                    <KeyRound className="h-4 w-4" />
                    <span className="text-sm font-semibold">Manager Credentials</span>
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="Admin username"
                      value={managerUsername}
                      onChange={(e) => { setManagerUsername(e.target.value); setLocalError(null); }}
                      autoComplete="off"
                      className="h-9 text-sm"
                    />
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Admin password"
                        value={managerPassword}
                        onChange={(e) => { setManagerPassword(e.target.value); setLocalError(null); }}
                        autoComplete="new-password"
                        className="h-9 text-sm pr-10"
                        onKeyDown={(e) => { if (e.key === "Enter") handleLocalOverride(); }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {localError && (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5 shrink-0" />{localError}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── PENDING (remote waiting) ──────────────────────────────────── */}
          {status === "pending" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
                <div className="text-center">
                  <p className="font-semibold text-gray-900">Waiting for Admin Approval</p>
                  <p className="text-sm text-gray-500 mt-1">Payment is held until the admin responds.</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-blue-800 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">Pending Request</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Discount:</span>
                  <span className="font-semibold">{discount.name} ({discount.percentage}%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount:</span>
                  <span className="font-semibold text-amber-700">-{fmt(discountCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Final Total:</span>
                  <span className="font-semibold text-green-700">{fmt(finalCents)}</span>
                </div>
                {reason.trim() && (
                  <div className="pt-1 border-t border-blue-100">
                    <span className="text-gray-500">Reason: </span>
                    <span className="text-gray-700">{reason.trim()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── APPROVED ─────────────────────────────────────────────────── */}
          {status === "approved" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <div className="text-center">
                <p className="font-bold text-green-700 text-lg">Discount Approved!</p>
                <p className="text-sm text-gray-600 mt-1">Approved by <strong>{adminName}</strong></p>
                <p className="text-sm text-gray-400 mt-1">Proceeding with payment…</p>
              </div>
            </div>
          )}

          {/* ── REJECTED ─────────────────────────────────────────────────── */}
          {status === "rejected" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="h-16 w-16 text-red-500" />
              <div className="text-center">
                <p className="font-bold text-red-700 text-lg">Discount Rejected</p>
                <p className="text-sm text-gray-600 mt-1">Rejected by <strong>{adminName}</strong></p>
                {rejectionReason && (
                  <p className="text-sm text-gray-500 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-xs">
                    "{rejectionReason}"
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-3">The discount has been cleared. You may select another or proceed without one.</p>
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-col">

          {/* Method selection — no method chosen yet */}
          {status === "idle" && method === null && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Cancel
            </Button>
          )}

          {/* Remote form footer */}
          {status === "idle" && method === "remote" && (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setMethod(null)} className="flex-1">
                ← Back
              </Button>
              <Button
                onClick={handleSendToAdmin}
                disabled={isRequesting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                {isRequesting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isRequesting ? "Sending…" : <><Send className="h-4 w-4" /> Send Request</>}
              </Button>
            </div>
          )}

          {/* Local override footer */}
          {status === "idle" && method === "local" && (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setMethod(null)} className="flex-1">
                ← Back
              </Button>
              <Button
                onClick={handleLocalOverride}
                disabled={isOverriding}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {isOverriding && <Loader2 className="h-4 w-4 animate-spin" />}
                {isOverriding ? "Verifying…" : <><KeyRound className="h-4 w-4" /> Authorize</>}
              </Button>
            </div>
          )}

          {/* Pending — cancel only */}
          {status === "pending" && (
            <Button
              variant="outline"
              onClick={handleCancelRequest}
              className="w-full border-red-200 text-red-600 hover:bg-red-50"
            >
              Cancel Request
            </Button>
          )}

          {/* Terminal states */}
          {(status === "approved" || status === "rejected") && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          )}

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
