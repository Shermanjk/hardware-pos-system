import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveCreditLimitOverride, rejectCreditLimitOverride } from "@/shared/api/creditApi";
import type { CreditLimitOverrideDecisionNotification } from "@/shared/hooks/useReturnNotifications";
import { AlertTriangle, CheckCircle, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface CreditLimitOverrideModalProps {
  /** Whether the modal is visible */
  open: boolean;
  onClose: () => void;
  /** Override request details */
  overrideId: number | null;
  customerName: string;
  requestedAmount: number;
  currentLimit: number;
  currentBalance: number;
  /** Called when admin approves — passes the approved override_id back */
  onApproved: (overrideId: number) => void;
  /** Called when admin rejects or cashier cancels */
  onRejected: () => void;
  /** Latest WS decision received — drives state transitions */
  latestDecision: CreditLimitOverrideDecisionNotification | null;
}

const fmt = (n: number) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreditLimitOverrideModal({
  open,
  onClose,
  overrideId,
  customerName,
  requestedAmount,
  currentLimit,
  currentBalance,
  onApproved,
  onRejected,
  latestDecision,
}: CreditLimitOverrideModalProps) {
  const [phase, setPhase] = useState<"waiting" | "approved" | "rejected">("waiting");
  const [adminPassword, setAdminPassword] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase("waiting");
      setAdminPassword("");
      setRejectionReason("");
      setShowRejectForm(false);
    }
  }, [open, overrideId]);

  // React to WS decision
  useEffect(() => {
    if (!latestDecision || latestDecision.override_id !== overrideId) return;
    if (latestDecision.decision === "approved") {
      setPhase("approved");
      setTimeout(() => { onApproved(overrideId!); onClose(); }, 1500);
    } else {
      setPhase("rejected");
    }
  }, [latestDecision, overrideId, onApproved, onClose]);

  const projectedBalance = currentBalance + requestedAmount;
  const exceedAmount = projectedBalance - currentLimit;

  async function handleLocalApprove() {
    if (!adminPassword.trim() || !overrideId) return;
    setIsSubmitting(true);
    try {
      await approveCreditLimitOverride(overrideId, { admin_password: adminPassword });
      setPhase("approved");
      toast.success(`Credit limit override approved for ${customerName}`);
      setTimeout(() => { onApproved(overrideId); onClose(); }, 1200);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to approve override.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLocalReject() {
    if (!adminPassword.trim() || !overrideId) return;
    setIsSubmitting(true);
    try {
      await rejectCreditLimitOverride(overrideId, { admin_password: adminPassword, rejection_reason: rejectionReason });
      setPhase("rejected");
      toast.warning("Credit limit override rejected.");
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to reject override.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center gap-3 ${
          phase === "approved" ? "bg-emerald-600" :
          phase === "rejected" ? "bg-red-600" :
          "bg-amber-500"
        }`}>
          {phase === "waiting" && <AlertTriangle className="h-6 w-6 text-white shrink-0" />}
          {phase === "approved" && <CheckCircle className="h-6 w-6 text-white shrink-0" />}
          {phase === "rejected" && <XCircle className="h-6 w-6 text-white shrink-0" />}
          <div>
            <h2 className="text-white font-bold text-base leading-tight">
              {phase === "waiting" ? "Credit Limit Override Request" :
               phase === "approved" ? "Override Approved!" :
               "Override Rejected"}
            </h2>
            <p className="text-white/80 text-xs mt-0.5">
              {phase === "waiting" ? "Waiting for admin authorization" : ""}
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Phase: Waiting */}
          {phase === "waiting" && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Customer</span>
                  <span className="font-semibold text-slate-900">{customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Sale Amount</span>
                  <span className="font-semibold text-slate-900">{fmt(requestedAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Current Balance</span>
                  <span className="font-semibold text-slate-900">{fmt(currentBalance)}</span>
                </div>
                <div className="border-t border-amber-200 pt-2 flex justify-between">
                  <span className="text-slate-600">Credit Limit</span>
                  <span className="font-semibold text-slate-900">{fmt(currentLimit)}</span>
                </div>
                <div className="flex justify-between text-red-700 font-bold">
                  <span>Exceeds Limit By</span>
                  <span>{fmt(exceedAmount)}</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 text-center">
                🔔 An override request has been sent to the Admin terminal. Waiting for approval…
              </div>

              {/* Admin present at this terminal can approve directly */}
              {!showRejectForm ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 text-center">Or, if an Admin is present, they can approve directly:</p>
                  <div className="relative">
                    <Input
                      ref={passwordRef}
                      type="password"
                      placeholder="Admin password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleLocalApprove(); }}
                      className="pr-32 h-10 text-sm border-slate-300"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                      onClick={handleLocalApprove}
                      disabled={isSubmitting || !adminPassword.trim()}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
                    </Button>
                    <Button
                      className="flex-1 h-10 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 text-sm font-semibold"
                      onClick={() => setShowRejectForm(true)}
                      variant="outline"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Input
                    type="password"
                    placeholder="Admin password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="h-10 text-sm border-slate-300"
                  />
                  <Input
                    placeholder="Rejection reason (optional)"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="h-10 text-sm border-slate-300"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
                      onClick={handleLocalReject}
                      disabled={isSubmitting || !adminPassword.trim()}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Reject"}
                    </Button>
                    <Button variant="outline" className="h-10 px-3" onClick={() => setShowRejectForm(false)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}

              <Button
                variant="ghost"
                className="w-full h-9 text-slate-500 text-xs"
                onClick={() => { onRejected(); onClose(); }}
              >
                Cancel and change payment method
              </Button>
            </>
          )}

          {/* Phase: Approved */}
          {phase === "approved" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="h-14 w-14 text-emerald-500" />
              <p className="text-lg font-bold text-emerald-800">Override Approved!</p>
              <p className="text-sm text-slate-600 text-center">
                The credit sale for <strong>{customerName}</strong> can proceed.
              </p>
            </div>
          )}

          {/* Phase: Rejected */}
          {phase === "rejected" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <XCircle className="h-14 w-14 text-red-500" />
              <p className="text-lg font-bold text-red-800">Override Rejected</p>
              <p className="text-sm text-slate-600 text-center">
                Admin did not authorize the credit limit override.
              </p>
              <Button
                className="w-full h-10 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold"
                onClick={() => { onRejected(); onClose(); }}
              >
                OK — Change Payment Method
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
