/**
 * EndShiftModal
 *
 * Shown when the cashier clicks "End Shift".
 * Step 1 — Open Shift: if no open session, prompts for an opening cash float.
 * Step 2 — End Shift:  if an open session exists, prompts for actual cash count,
 *           then shows the reconciliation result (read-only).
 */

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
    closeSession,
    getMySession,
    openSession,
    type CashSession,
    type CloseSessionResult,
} from "@/shared/api/cashReconciliationApi";
import { getXReading } from "@/shared/api/birApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { formatXReadingText, printThermalMonospace } from "@/shared/utils/birReceiptFormatter";
import { AlertCircle, CheckCircle2, LogOut, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "₱0.00";
  return (
    "₱" +
    Number(n).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function parsePeso(raw: string): number | null {
  const cleaned = raw.replace(/[₱,\s]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "Balanced" | "Short" | "Over" }) {
  if (status === "Balanced")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-800 text-sm font-bold border border-green-300">
        <CheckCircle2 className="h-4 w-4" /> Balanced
      </span>
    );
  if (status === "Short")
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 text-sm font-bold border border-red-300">
        <TrendingDown className="h-4 w-4" /> Short
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-sm font-bold border border-amber-300">
      <TrendingUp className="h-4 w-4" /> Over
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EndShiftModalProps {
  open:    boolean;
  onClose: () => void;
  /** Called after a shift is successfully closed so the parent can refresh session state */
  onShiftClosed?: () => void;
  /** Called after an opening session is started */
  onShiftOpened?: () => void;
  /** If true, modal was opened as part of the Logout flow */
  isLogoutFlow?: boolean;
  /** Triggered when the cashier acknowledges the reconciliation result to complete logout */
  onLogoutAfterShift?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

type ModalStep = "loading" | "open-shift" | "end-shift" | "result";

export default function EndShiftModal({
  open,
  onClose,
  onShiftClosed,
  onShiftOpened,
  isLogoutFlow = false,
  onLogoutAfterShift,
}: EndShiftModalProps) {
  const [step, setStep] = useState<ModalStep>("loading");
  const [session, setSession] = useState<CashSession | null>(null);
  const [shiftLabel, setShiftLabel] = useState("Day Shift");
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [actualCashInput, setActualCashInput] = useState("");
  const [result, setResult] = useState<CloseSessionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load session on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStep("loading");
    setError(null);
    setResult(null);
    setActualCashInput("");
    setOpeningCashInput("");

    getMySession()
      .then((s) => {
        setSession(s);
        setStep(s ? "end-shift" : "open-shift");
      })
      .catch(() => {
        setError("Failed to load session. Please try again.");
        setStep("end-shift"); // fallback
      });
  }, [open]);

  // ── Auto-focus the input on step change ──────────────────────────────────
  useEffect(() => {
    if (step === "end-shift" || step === "open-shift") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Open shift handler ────────────────────────────────────────────────────
  const handleOpenShift = async () => {
    setError(null);
    const amount = parsePeso(openingCashInput);
    if (amount === null || amount < 0) {
      setError("Please enter a valid opening cash amount.");
      return;
    }

    setSubmitting(true);
    try {
      await openSession({ opening_cash: amount, shift_label: shiftLabel });
      toast.success("Shift started successfully.");
      // Reload session then go to end-shift view
      const s = await getMySession();
      setSession(s);
      onShiftOpened?.();
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        "Failed to open shift. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── End shift handler ─────────────────────────────────────────────────────
  const handleEndShift = async () => {
    setError(null);
    const amount = parsePeso(actualCashInput);
    if (amount === null || amount < 0) {
      setError("Please enter the total cash amount in the drawer.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await closeSession({ actual_cash: amount });
      setResult(res);
      setStep("result");
      onShiftClosed?.();
      toast.success("Shift ended. Reconciliation submitted.");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        "Failed to close shift. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const [printingXReading, setPrintingXReading] = useState(false);

  const handlePrintXReading = async (targetSessionId?: number) => {
    const sId = targetSessionId || session?.id;
    if (!sId) {
      toast.error("No active shift session found to print.");
      return;
    }
    setPrintingXReading(true);
    try {
      const [xData, settings] = await Promise.all([
        getXReading(sId),
        getSettings().catch(() => ({}) as StoreSettings),
      ]);
      const formatted = formatXReadingText({
        sessionId: xData.session_id,
        shiftLabel: xData.shift_label,
        cashierName: xData.cashier_name,
        openedAt: xData.opened_at,
        closedAt: xData.closed_at,
        begInvoiceNo: xData.beg_invoice_no,
        endInvoiceNo: xData.end_invoice_no,
        transactionCount: xData.transaction_count,
        shiftGross: xData.shift_gross,
        shiftDiscounts: xData.shift_discounts,
        shiftRefunds: xData.shift_refunds,
        shiftNet: xData.shift_net,
        openingCash: xData.opening_cash,
        cashSales: xData.cash_sales,
        creditCollections: xData.credit_collections,
        cashRefunds: xData.cash_refunds,
        expectedCash: xData.expected_cash,
        actualCash: xData.actual_cash,
        variance: xData.variance,
        status: xData.status,
        settings: settings as StoreSettings,
      });
      printThermalMonospace(formatted);
      toast.success("X-Reading sent to thermal printer.");
    } catch (err) {
      console.error("Print X-Reading error:", err);
      toast.error("Failed to generate X-Reading printout.");
    } finally {
      setPrintingXReading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step !== "result") onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">
          {step === "open-shift" ? "Start Shift" : step === "end-shift" ? "End Shift" : "Reconciliation Result"}
        </DialogTitle>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="px-6 py-4 bg-slate-800 text-white rounded-t-lg">
          <h2 className="text-base font-bold">
            {step === "open-shift"
              ? "Start New Shift"
              : step === "end-shift"
              ? "End Shift — Cash Count"
              : "Reconciliation Summary"}
          </h2>
          {step === "end-shift" && session && (
            <p className="text-xs text-slate-300 mt-0.5">
              {session.shift_label} · Opened{" "}
              {new Date(session.opened_at).toLocaleTimeString("en-PH", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────── */}
        <div className="px-6 py-5 space-y-4">

          {/* Loading */}
          {step === "loading" && (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm gap-2">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Loading shift info…
            </div>
          )}

          {/* Open Shift step */}
          {step === "open-shift" && (
            <>
              <div className="text-sm text-gray-600">
                Enter the opening cash float for this shift. This is the amount already in the drawer when you start.
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Shift Type
                </label>
                <select
                  value={shiftLabel}
                  onChange={(e) => setShiftLabel(e.target.value)}
                  className="w-full h-10 border border-gray-300 rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <option value="Morning Shift">Morning Shift</option>
                  <option value="Day Shift">Day Shift</option>
                  <option value="Afternoon Shift">Afternoon Shift</option>
                  <option value="Night Shift">Night Shift</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Opening Cash Float
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-sm">₱</span>
                  <input
                    ref={inputRef}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleOpenShift(); }}
                    className="w-full h-12 border-2 border-gray-300 rounded-md pl-7 pr-3 text-lg font-bold text-right focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <p className="text-xs text-gray-400">Enter 0 if starting with an empty drawer.</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleOpenShift} disabled={submitting}>
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Starting…
                    </span>
                  ) : (
                    "Start Shift"
                  )}
                </Button>
              </div>
            </>
          )}

          {/* End Shift step */}
          {step === "end-shift" && (
            <>
              <div className="text-sm text-gray-600">
                Count all physical cash in the drawer and enter the total below. Do <strong>not</strong> include denominations — just the final total.
              </div>

              {session && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm space-y-1.5">
                  <div className="flex justify-between text-gray-600">
                    <span>Opening Float</span>
                    <span className="font-semibold text-gray-900">{fmt(session.opening_cash)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 text-xs">
                    <span>Shift started</span>
                    <span>
                      {new Date(session.opened_at).toLocaleString("en-PH", {
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                  Actual Cash in Drawer
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-sm">₱</span>
                  <input
                    ref={inputRef}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleEndShift(); }}
                    className="w-full h-14 border-2 border-gray-300 rounded-md pl-7 pr-3 text-xl font-bold text-right focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  Enter the total amount of all physical cash counted in the drawer.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                  onClick={() => handlePrintXReading()}
                  disabled={submitting || printingXReading}
                >
                  <Printer className="h-4 w-4 text-slate-600" />
                  {printingXReading ? "Printing…" : "Print X-Reading"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold"
                  onClick={handleEndShift}
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Submitting…
                    </span>
                  ) : (
                    "Submit Cash Count"
                  )}
                </Button>
              </div>

              <p className="text-center text-xs text-gray-400">
                This submission is final and cannot be edited after submission.
              </p>
            </>
          )}

          {/* Result step — read-only reconciliation summary */}
          {step === "result" && result && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Reconciliation Result</h3>
                <StatusBadge status={result.status} />
              </div>

              <div className="rounded-xl border-2 border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <Row label="Opening Float"     value={fmt(result.opening_cash)} />
                    <Row label="Cash Sales"         value={fmt(result.cash_sales)} color="text-green-700" />
                    <Row label="Cash Refunds"       value={`− ${fmt(result.cash_refunds)}`} color="text-red-600" />
                    <Row label="Cash Paid-Out"      value={`− ${fmt(result.cash_paid_out)}`} color="text-red-600" />
                    <RowDivider />
                    <Row label="Expected Cash"      value={fmt(result.expected_cash)} bold />
                    <Row label="Actual Cash (Counted)" value={fmt(result.actual_cash)} bold />
                    <RowDivider />
                    <Row
                      label="Variance"
                      value={
                        (result.variance > 0 ? "+" : "") + fmt(result.variance)
                      }
                      bold
                      color={
                        Math.abs(result.variance) < 0.01
                          ? "text-green-700"
                          : result.variance < 0
                          ? "text-red-600"
                          : "text-amber-600"
                      }
                    />
                  </tbody>
                </table>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-slate-300 font-semibold text-slate-800 hover:bg-slate-100"
                onClick={() => handlePrintXReading(session?.id)}
                disabled={printingXReading}
              >
                <Printer className="h-4 w-4 text-slate-600" />
                {printingXReading ? "Printing X-Reading…" : "Print X-Reading Report (80mm)"}
              </Button>

              <div className="text-xs text-gray-500 text-center">
                This record has been submitted and sent to the Admin for review.
                <br />
                {isLogoutFlow
                  ? "Click below to acknowledge and complete your logout."
                  : "You cannot modify it after submission."}
              </div>

              {isLogoutFlow ? (
                <Button
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold flex items-center justify-center gap-2 h-11 shadow-md"
                  onClick={() => {
                    onClose();
                    onLogoutAfterShift?.();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  Acknowledge & Complete Logout
                </Button>
              ) : (
                <Button className="w-full bg-slate-800 hover:bg-slate-900 text-white" onClick={onClose}>
                  Close
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold = false,
  color = "",
}: {
  label: string;
  value: string;
  bold?: boolean;
  color?: string;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className={`px-4 py-2.5 text-gray-600 ${bold ? "font-semibold" : ""}`}>{label}</td>
      <td className={`px-4 py-2.5 text-right tabular-nums ${bold ? "font-bold" : "font-medium"} ${color}`}>
        {value}
      </td>
    </tr>
  );
}

function RowDivider() {
  return (
    <tr>
      <td colSpan={2}>
        <div className="h-px bg-gray-200 mx-0" />
      </td>
    </tr>
  );
}
