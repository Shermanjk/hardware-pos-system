import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { submitCommodityPurchase, authorizeCommodityPurchase, type RecordPurchasePayload } from "@/shared/api/commodityApi";
import { createAdjustmentRequest, authorizeAdjustmentRequest, type CreateAdjustmentRequestPayload } from "@/shared/api/inventoryApi";
import {
    AlertTriangle,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestType = "commodity_purchase" | "market_adjustment";
type ApprovalMethod = "remote" | "local";
type ModalStatus = "idle" | "pending" | "approved";

// The payload needed to create the request — only sent when a method is chosen
type RequestPayload =
  | { type: "commodity_purchase"; payload: RecordPurchasePayload }
  | { type: "market_adjustment"; payload: CreateAdjustmentRequestPayload };

interface ClerkAuthModalProps {
  open: boolean;
  onClose: () => void;
  requestType: RequestType;
  /** The payload to create the request — passed in so the request is only
   *  created when the clerk actively chooses a method (remote or local).
   *  Set to null when the request was already created externally. */
  createPayload: RequestPayload | null;
  /** If the request is already created, pass its ID here directly */
  existingRequestId?: number | null;
  /** Summary lines to display in the confirmation card */
  summary: { label: string; value: string }[];
  title: string;
  /** Called when the admin successfully approves on this terminal */
  onApproved: (adminName: string) => void;
  /** Called after the request is created (either path) so the parent can refresh */
  onRequestCreated?: (id: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClerkAuthModal({
  open,
  onClose,
  requestType,
  createPayload,
  existingRequestId = null,
  summary,
  title,
  onApproved,
  onRequestCreated,
}: ClerkAuthModalProps) {
  const [method, setMethod] = useState<ApprovalMethod | null>(null);
  const [status, setStatus] = useState<ModalStatus>("idle");
  const [adminName, setAdminName] = useState("");

  // The request ID — set after createPayload is submitted
  const [requestId, setRequestId] = useState<number | null>(existingRequestId);

  // Remote flow
  const [isCreating, setIsCreating] = useState(false);

  // Local override
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

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setMethod(null);
      setStatus("idle");
      setAdminName("");
      setRequestId(existingRequestId);
      setIsCreating(false);
      setManagerUsername("");
      setManagerPassword("");
      setShowPassword(false);
      setLocalError(null);
      setIsOverriding(false);
    }
  }, [open, existingRequestId]);

  // ── Create request helper ─────────────────────────────────────────────────
  async function ensureRequestCreated(): Promise<number | null> {
    if (requestId) return requestId;
    if (!createPayload) return null;

    if (createPayload.type === "commodity_purchase") {
      const result = await submitCommodityPurchase(createPayload.payload);
      const id = result.id;
      if (mountedRef.current) {
        setRequestId(id);
        onRequestCreated?.(id);
      }
      return id;
    } else {
      const result = await createAdjustmentRequest(createPayload.payload);
      const id = result.id;
      if (mountedRef.current) {
        setRequestId(id);
        onRequestCreated?.(id);
      }
      return id;
    }
  }

  // ── Remote: create request and wait for admin to act on their terminal ───
  const handleSendToAdmin = async () => {
    setIsCreating(true);
    try {
      await ensureRequestCreated();
      if (!mountedRef.current) return;
      setMethod("remote");
      setStatus("pending");
      toast.info("Request sent to admin terminal.", { duration: 4000 });
    } catch (err: any) {
      if (!mountedRef.current) return;
      toast.error(err?.response?.data?.message ?? "Failed to submit request.");
    } finally {
      if (mountedRef.current) setIsCreating(false);
    }
  };

  // ── Local: use atomic endpoint — creates + approves in ONE transaction ──────
  // This way the record NEVER appears as PENDING_APPROVAL on the admin terminal
  const handleAuthorize = async () => {
    if (!managerUsername.trim() || !managerPassword) {
      setLocalError("Manager username and password are required.");
      return;
    }
    if (!createPayload && !existingRequestId) {
      setLocalError("No request payload available.");
      return;
    }
    setLocalError(null);
    setIsOverriding(true);

    const credentials = { username: managerUsername.trim(), password: managerPassword };

    try {
      let approvedBy = "";

      if (createPayload) {
        // ── New record: use atomic authorize endpoint ─────────────────────────
        if (createPayload.type === "commodity_purchase") {
          const result = await authorizeCommodityPurchase(createPayload.payload, credentials);
          approvedBy = result.admin_name;
          if (mountedRef.current) {
            setRequestId(result.id);
            onRequestCreated?.(result.id);
          }
        } else {
          const result = await authorizeAdjustmentRequest(createPayload.payload, credentials);
          approvedBy = result.admin_name;
          if (mountedRef.current) {
            setRequestId(result.id);
            onRequestCreated?.(result.id);
          }
        }
      } else if (existingRequestId) {
        // ── Existing PENDING_APPROVAL record: use local-override ─────────────
        // (This path is used when the record was already created via remote flow)
        if (requestType === "commodity_purchase") {
          const { localOverrideCommodityPurchase } = await import("@/shared/api/commodityApi");
          const result = await localOverrideCommodityPurchase(existingRequestId, credentials);
          approvedBy = result.admin_name;
        } else {
          const { localOverrideAdjustmentRequest } = await import("@/shared/api/inventoryApi");
          const result = await localOverrideAdjustmentRequest(existingRequestId, credentials);
          approvedBy = result.admin_name;
        }
      }

      if (!mountedRef.current) return;
      setAdminName(approvedBy);
      setStatus("approved");
      toast.success(`Authorized by ${approvedBy}`, { duration: 4000 });

      setTimeout(() => {
        if (!mountedRef.current) return;
        onApproved(approvedBy);
        onClose();
      }, 1200);
    } catch (err: any) {
      if (!mountedRef.current) return;
      console.error("Authorization error:", err);
      console.error("Response data:", err?.response?.data);
      const msg: string = err?.response?.data?.message ?? "Authorization failed.";
      setLocalError(msg);
      setManagerPassword("");
    } finally {
      if (mountedRef.current) setIsOverriding(false);
    }
  };

  // Block accidental close while remote is pending
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && status === "pending") return;
    if (!nextOpen) onClose();
  };

  const SummaryCard = () => (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 text-amber-800 mb-1">
        <AlertTriangle className="h-4 w-4" />
        <span className="font-semibold">Admin Authorization Required</span>
      </div>
      {summary.map((row) => (
        <div key={row.label} className="flex justify-between">
          <span className="text-gray-500">{row.label}</span>
          <span className="font-semibold text-gray-900">{row.value}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-purple-600" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* ── METHOD SELECTION ─────────────────────────────────────────── */}
          {status === "idle" && method === null && (
            <>
              <SummaryCard />
              <p className="text-sm text-gray-600 font-medium">How would you like to get approval?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleSendToAdmin}
                  disabled={isCreating}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    {isCreating ? (
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
              <SummaryCard />
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
                  autoFocus
                />
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Admin password"
                    value={managerPassword}
                    onChange={(e) => { setManagerPassword(e.target.value); setLocalError(null); }}
                    autoComplete="new-password"
                    className="h-9 text-sm pr-10"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAuthorize(); }}
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
            </>
          )}

          {/* ── PENDING (remote waiting) ──────────────────────────────────── */}
          {status === "pending" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
                <div className="text-center">
                  <p className="font-semibold text-gray-900">Waiting for Admin Approval</p>
                  <p className="text-sm text-gray-500 mt-1">The admin will review on their terminal.</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-blue-800 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="font-semibold">Pending Request</span>
                </div>
                {summary.slice(0, 3).map((row) => (
                  <div key={row.label} className="flex justify-between">
                    <span className="text-gray-600">{row.label}:</span>
                    <span className="font-semibold">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── APPROVED ─────────────────────────────────────────────────── */}
          {status === "approved" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <div className="text-center">
                <p className="font-bold text-green-700 text-lg">Approved!</p>
                <p className="text-sm text-gray-600 mt-1">Authorized by <strong>{adminName}</strong></p>
                <p className="text-sm text-gray-400 mt-1">Inventory has been updated.</p>
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
              <Button variant="outline" onClick={() => setMethod(null)} className="flex-1" disabled={isOverriding}>
                Back
              </Button>
              <Button
                onClick={handleAuthorize}
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

          {status === "approved" && (
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          )}

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
