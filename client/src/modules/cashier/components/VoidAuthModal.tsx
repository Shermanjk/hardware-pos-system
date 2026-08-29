import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { requestVoidSale } from "@/shared/api/salesApi";
import { directOverrideVoid, localOverrideVoid } from "@/shared/api/voidApi";
import { loadToken } from "@/shared/utils/auth";
import {
    AlertTriangle,
    Ban,
    CheckCircle,
    Clock,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    Send,
    XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface VoidAuthModalProps {
  open: boolean;
  onClose: () => void;
  /** The sale_id that needs to be voided */
  saleId: number | null;
  /** The reason for the void (entered by cashier before opening this modal) */
  voidReason: string;
  invoiceNumber: string;
  totalAmount: number;
  /** Called when void is approved (either remote or local) */
  onApproved: () => void;
}

type ModalStatus = "idle" | "pending" | "approved" | "rejected";
type ApprovalMethod = "remote" | "local";

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VoidAuthModal({
  open,
  onClose,
  saleId,
  voidReason,
  invoiceNumber,
  totalAmount,
  onApproved,
}: VoidAuthModalProps) {
  const [method, setMethod] = useState<ApprovalMethod | null>(null);
  const [status, setStatus] = useState<ModalStatus>("idle");
  const [adminName, setAdminName] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // The void_id is created only after the cashier chooses a method
  const [voidId, setVoidId] = useState<number | null>(null);

  // Remote method state
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);

  // Local override state
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

  // Reset state whenever the modal opens
  useEffect(() => {
    if (open) {
      setMethod(null);
      setStatus("idle");
      setAdminName("");
      setRejectionReason("");
      setVoidId(null);
      setIsCreatingRequest(false);
      setManagerUsername("");
      setManagerPassword("");
      setShowPassword(false);
      setLocalError(null);
      setIsOverriding(false);
    }
  }, [open]);

  // WebSocket — listen for remote void decision
  useEffect(() => {
    if (!open || status !== "pending" || voidId === null) return;

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
          if (data.type === "void_decision" && data.void_id === voidId) {
            if (!mountedRef.current) return;
            if (data.decision === "approved") {
              setStatus("approved");
              setAdminName(data.admin_name ?? "Admin");
              toast.success(`Void approved by ${data.admin_name ?? "Admin"}`, { duration: 5000 });
              setTimeout(() => {
                if (!mountedRef.current) return;
                onApproved();
                onClose();
              }, 1500);
            } else {
              setStatus("rejected");
              setAdminName(data.admin_name ?? "Admin");
              setRejectionReason(data.rejection_reason ?? "");
              toast.error(`Void rejected by ${data.admin_name ?? "Admin"}`, {
                description: data.rejection_reason ?? undefined,
                duration: 5000,
              });
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
  }, [open, status, voidId, onApproved, onClose]);

  // ── Remote: create the void request ONLY when cashier picks "Send to Admin Terminal"
  const handleSendToAdmin = async () => {
    if (!saleId) return;
    setIsCreatingRequest(true);
    try {
      const result = await requestVoidSale(saleId, voidReason);
      if (!mountedRef.current) return;
      setVoidId(result.void_id);
      setMethod("remote");
      setStatus("pending");
      toast.info("Void request sent to admin terminal.", { duration: 4000 });
    } catch (err: any) {
      if (!mountedRef.current) return;
      toast.error(err?.response?.data?.message ?? "Failed to send void request.");
    } finally {
      if (mountedRef.current) setIsCreatingRequest(false);
    }
  };

  const handleLocalOverride = async () => {
    if (!saleId) return;
    if (!managerUsername.trim() || !managerPassword) {
      setLocalError("Manager username and password are required.");
      return;
    }
    setLocalError(null);
    setIsOverriding(true);

    try {
      let overrideResult;
      if (voidId) {
        // Approving a request that was already sent to Admin
        overrideResult = await localOverrideVoid(voidId, {
          username: managerUsername.trim(),
          password: managerPassword,
        });
      } else {
        // Direct manager override: Authenticates credentials FIRST before creating any DB record
        overrideResult = await directOverrideVoid({
          sale_id: saleId,
          reason: voidReason,
          username: managerUsername.trim(),
          password: managerPassword,
        });
      }

      if (!mountedRef.current) return;

      const approvedBy = overrideResult.admin_name ?? "Manager";
      setStatus("approved");
      setAdminName(approvedBy);
      toast.success(`Void authorized by ${approvedBy}`, { duration: 4000 });

      setTimeout(() => {
        if (!mountedRef.current) return;
        onApproved();
        onClose();
      }, 1200);
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg: string = err?.response?.data?.message ?? "Authorization failed.";
      setLocalError(msg);
      setManagerPassword("");
    } finally {
      if (mountedRef.current) setIsOverriding(false);
    }
  };

  // Block accidental close while a remote request is pending
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && status === "pending") return;
    if (!nextOpen) onClose();
  };

  const SaleSummary = () => (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-red-800 mb-1">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-semibold">Admin Approval Required</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-600">Invoice:</span>
        <span className="font-mono font-semibold">{invoiceNumber}</span>
      </div>
      <div className="flex justify-between border-t border-red-200 pt-2">
        <span className="text-gray-700 font-semibold">Total:</span>
        <span className="font-bold text-red-700">{fmt(totalAmount)}</span>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-600" />
            Void Approval Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* ── METHOD SELECTION ─────────────────────────────────────────── */}
          {status === "idle" && method === null && (
            <>
              <SaleSummary />
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
              <SaleSummary />
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
            </>
          )}

          {/* ── PENDING (remote waiting) ──────────────────────────────────── */}
          {status === "pending" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <Loader2 className="h-10 w-10 text-red-500 animate-spin" />
                <div className="text-center">
                  <p className="font-semibold text-gray-900">Waiting for Admin Approval</p>
                  <p className="text-sm text-gray-500 mt-1">Void is on hold until the admin responds.</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-blue-800 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">Pending Void Request</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice:</span>
                  <span className="font-mono font-semibold">{invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-semibold text-red-700">{fmt(totalAmount)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── APPROVED ─────────────────────────────────────────────────── */}
          {status === "approved" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <div className="text-center">
                <p className="font-bold text-green-700 text-lg">Void Approved!</p>
                <p className="text-sm text-gray-600 mt-1">Approved by <strong>{adminName}</strong></p>
                <p className="text-sm text-gray-400 mt-1">Sale has been voided and inventory restored.</p>
              </div>
            </div>
          )}

          {/* ── REJECTED ─────────────────────────────────────────────────── */}
          {status === "rejected" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="h-16 w-16 text-red-500" />
              <div className="text-center">
                <p className="font-bold text-red-700 text-lg">Void Rejected</p>
                <p className="text-sm text-gray-600 mt-1">Rejected by <strong>{adminName}</strong></p>
                {rejectionReason && (
                  <p className="text-sm text-gray-500 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-xs">
                    "{rejectionReason}"
                  </p>
                )}
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
