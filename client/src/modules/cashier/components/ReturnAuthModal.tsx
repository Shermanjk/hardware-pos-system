import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createReturn, localOverrideReturn, type CreateReturnPayload } from "@/shared/api/returnsApi";
import { loadToken } from "@/shared/utils/auth";
import {
    AlertTriangle,
    CheckCircle,
    Clock,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    RotateCcw,
    Send,
    XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Resolution = "refund" | "exchange" | "store_credit" | "rejected";

interface ReturnAuthModalProps {
  open: boolean;
  onClose: () => void;
  /** The full payload needed to create the return — only submitted when a method is chosen */
  returnPayload: CreateReturnPayload | null;
  invoiceNumber: string;
  customerName: string;
  /** Called when the return is approved (remote or local) so the parent can refresh */
  onApproved: () => void;
}

type ModalStatus = "idle" | "pending" | "approved" | "rejected";
type ApprovalMethod = "remote" | "local";

export default function ReturnAuthModal({
  open,
  onClose,
  returnPayload,
  invoiceNumber,
  customerName,
  onApproved,
}: ReturnAuthModalProps) {
  const [method, setMethod] = useState<ApprovalMethod | null>(null);
  const [status, setStatus] = useState<ModalStatus>("idle");
  const [adminName, setAdminName] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // The return id — set only after createReturn succeeds
  const [returnId, setReturnId] = useState<number | null>(null);
  const [returnNumber, setReturnNumber] = useState("");

  // Remote flow state
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);

  // Local override state
  const [resolution, setResolution] = useState<Resolution>("refund");
  const [exchangeBarcode, setExchangeBarcode] = useState("");
  const [exchangeQuantity, setExchangeQuantity] = useState<number>(1);
  const [localRejectionReason, setLocalRejectionReason] = useState("");
  const [managerUsername, setManagerUsername] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isOverriding, setIsOverriding] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Reset all state when dialog opens
  useEffect(() => {
    if (open) {
      setMethod(null);
      setStatus("idle");
      setAdminName("");
      setRejectionReason("");
      setReturnId(null);
      setReturnNumber("");
      setIsCreatingRequest(false);
      setResolution("refund");
      setExchangeBarcode("");
      setExchangeQuantity(1);
      setLocalRejectionReason("");
      setManagerUsername("");
      setManagerPassword("");
      setShowPassword(false);
      setLocalError(null);
      setIsOverriding(false);
    }
  }, [open]);

  // WebSocket — listen for remote return decision
  useEffect(() => {
    if (!open || status !== "pending" || returnId === null) return;

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
          if (data.type === "return_decision" && data.id === returnId) {
            if (!mountedRef.current) return;
            if (data.decision === "approved") {
              setStatus("approved");
              setAdminName(data.admin_name ?? "Admin");
              toast.success(`Return approved by ${data.admin_name ?? "Admin"}`, { duration: 5000 });
              setTimeout(() => {
                if (!mountedRef.current) return;
                onApproved();
                onClose();
              }, 1500);
            } else {
              setStatus("rejected");
              setAdminName(data.admin_name ?? "Admin");
              setRejectionReason("");
              toast.error(`Return rejected by ${data.admin_name ?? "Admin"}`, { duration: 5000 });
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
  }, [open, status, returnId, onApproved, onClose]);

  // ── Remote: create the return request ONLY when cashier picks "Send to Admin Terminal"
  const handleSendToAdmin = async () => {
    if (!returnPayload) return;
    setIsCreatingRequest(true);
    try {
      const result = await createReturn(returnPayload);
      if (!mountedRef.current) return;
      setReturnId(result.id);
      setReturnNumber(result.return_number);
      setMethod("remote");
      setStatus("pending");
      toast.info("Return request sent to admin terminal.", { duration: 4000 });
    } catch (err: any) {
      if (!mountedRef.current) return;
      toast.error(err?.response?.data?.message ?? "Failed to submit return request.");
    } finally {
      if (mountedRef.current) setIsCreatingRequest(false);
    }
  };

  const handleLocalOverride = async () => {
    if (!returnPayload) return;
    if (!managerUsername.trim() || !managerPassword) {
      setLocalError("Manager username and password are required.");
      return;
    }
    if (resolution === "exchange" && (!exchangeBarcode.trim() || exchangeQuantity < 1)) {
      setLocalError("Exchange requires a barcode and quantity.");
      return;
    }
    if (resolution === "rejected" && !localRejectionReason.trim()) {
      setLocalError("A rejection reason is required.");
      return;
    }
    setLocalError(null);
    setIsOverriding(true);

    try {
      // 1. Create the return request first (so there's a DB record to approve)
      let effectiveReturnId = returnId;
      let effectiveReturnNumber = returnNumber;
      if (!effectiveReturnId) {
        const created = await createReturn(returnPayload);
        effectiveReturnId = created.id;
        effectiveReturnNumber = created.return_number;
        if (mountedRef.current) {
          setReturnId(effectiveReturnId);
          setReturnNumber(effectiveReturnNumber);
        }
      }

      // 2. Immediately approve it via manager override
      const result = await localOverrideReturn(effectiveReturnId, {
        username: managerUsername.trim(),
        password: managerPassword,
        resolution,
        exchange_barcode: resolution === "exchange" ? exchangeBarcode.trim() : undefined,
        exchange_quantity: resolution === "exchange" ? exchangeQuantity : undefined,
        rejection_reason: resolution === "rejected" ? localRejectionReason.trim() : undefined,
      });

      if (!mountedRef.current) return;

      const approvedBy = result.admin_name ?? "Manager";

      if (resolution === "rejected") {
        setStatus("rejected");
        setAdminName(approvedBy);
        toast.error(`Return rejected by ${approvedBy}`, { duration: 4000 });
      } else {
        setStatus("approved");
        setAdminName(approvedBy);
        toast.success(`Return approved by ${approvedBy}`, { duration: 4000 });
        setTimeout(() => {
          if (!mountedRef.current) return;
          onApproved();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg: string = err?.response?.data?.message ?? "Authorization failed.";
      setLocalError(msg);
      setManagerPassword("");
    } finally {
      if (mountedRef.current) setIsOverriding(false);
    }
  };

  // Block accidental close while remote request is pending
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && status === "pending") return;
    if (!nextOpen) onClose();
  };

  const ReturnSummary = () => (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-blue-800 mb-1">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-semibold">Admin Approval Required</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Invoice:</span>
        <span className="font-semibold">{invoiceNumber}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Customer:</span>
        <span className="font-medium">{customerName}</span>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-blue-600" />
            Return Approval Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* ── METHOD SELECTION ─────────────────────────────────────────── */}
          {status === "idle" && method === null && (
            <>
              <ReturnSummary />
              <p className="text-sm text-gray-600 font-medium">How would you like to get approval?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleSendToAdmin}
                  disabled={isCreatingRequest}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    {isCreatingRequest ? (
                      <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5 text-blue-600" />
                    )}
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

          {/* ── LOCAL OVERRIDE FORM ───────────────────────────────────────── */}
          {status === "idle" && method === "local" && (
            <>
              <ReturnSummary />
              <div className="space-y-3">

                {/* Resolution selector */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Resolution</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["refund", "exchange", "store_credit", "rejected"] as Resolution[]).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setResolution(opt); setLocalError(null); }}
                        className={`p-2.5 rounded-lg border-2 text-xs font-semibold text-center transition-colors ${
                          resolution === opt
                            ? opt === "rejected"
                              ? "border-red-500 bg-red-50 text-red-700"
                              : "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {opt === "refund" ? "💰 Refund"
                          : opt === "exchange" ? "🔄 Exchange"
                          : opt === "store_credit" ? "💳 Store Credit"
                          : "❌ Reject"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Exchange details */}
                {resolution === "exchange" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-900">Exchange Details</p>
                    <Input
                      placeholder="Exchange product barcode"
                      value={exchangeBarcode}
                      onChange={(e) => { setExchangeBarcode(e.target.value); setLocalError(null); }}
                      className="h-9 text-sm"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Quantity"
                      value={exchangeQuantity}
                      onChange={(e) => setExchangeQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="h-9 text-sm"
                    />
                  </div>
                )}

                {/* Rejection reason */}
                {resolution === "rejected" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">
                      Rejection Reason <span className="text-red-500">*</span>
                    </label>
                    <Input
                      placeholder="Enter reason for rejection…"
                      value={localRejectionReason}
                      onChange={(e) => { setLocalRejectionReason(e.target.value); setLocalError(null); }}
                      className="h-9 text-sm"
                    />
                  </div>
                )}

                {/* Manager credentials */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-purple-800">
                    <KeyRound className="h-4 w-4" />
                    <span className="text-sm font-semibold">Manager Credentials</span>
                  </div>
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
                <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                <div className="text-center">
                  <p className="font-semibold text-gray-900">Waiting for Admin Approval</p>
                  <p className="text-sm text-gray-500 mt-1">The admin will review and select a resolution.</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-blue-800 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">Pending Return Request</span>
                </div>
                {returnNumber && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Return #:</span>
                    <span className="font-mono font-semibold">{returnNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice:</span>
                  <span className="font-semibold">{invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Customer:</span>
                  <span>{customerName}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── APPROVED ─────────────────────────────────────────────────── */}
          {status === "approved" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <div className="text-center">
                <p className="font-bold text-green-700 text-lg">Return Approved!</p>
                <p className="text-sm text-gray-600 mt-1">Approved by <strong>{adminName}</strong></p>
                <p className="text-sm text-gray-400 mt-1">Proceeding to resolution…</p>
              </div>
            </div>
          )}

          {/* ── REJECTED ─────────────────────────────────────────────────── */}
          {status === "rejected" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="h-16 w-16 text-red-500" />
              <div className="text-center">
                <p className="font-bold text-red-700 text-lg">Return Rejected</p>
                <p className="text-sm text-gray-600 mt-1">Rejected by <strong>{adminName}</strong></p>
                {rejectionReason && (
                  <p className="text-sm text-gray-500 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-xs">
                    "{rejectionReason}"
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-3">Inform the customer and close this request.</p>
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-col">

          {status === "idle" && method === null && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Cancel
            </Button>
          )}

          {status === "idle" && method === "local" && (
            <div className="flex gap-2 w-full">
              <Button variant="outline" onClick={() => setMethod(null)} className="flex-1">
                Back
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

          {status === "pending" && (
            <p className="text-xs text-center text-gray-400">
              Waiting for admin to act on their terminal…
            </p>
          )}

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
