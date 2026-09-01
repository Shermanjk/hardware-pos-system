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
import { getXReading, createZReading, getZReading, type ZReadingRecord } from "@/shared/api/birApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { formatXReadingText, formatZReadingText, printThermalMonospace } from "@/shared/utils/birReceiptFormatter";
import { useActiveTerminal } from "@/shared/hooks/useActiveTerminal";
import { AlertCircle, CheckCircle2, FileCheck, LogOut, Printer, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
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

function pad4(num: number | string | null | undefined): string {
  return String(num || 0).padStart(4, "0");
}

function parsePeso(raw: string): number | null {
  const cleaned = raw.replace(/[₱,\s]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function formatCurrencyInput(raw: string): string {
  const clean = raw.replace(/[^\d.]/g, "");
  if (!clean) return "";

  const parts = clean.split(".");
  const intPart = parts[0];
  const decPart = parts.length > 1 ? parts.slice(1).join("").slice(0, 2) : null;

  const formattedInt = intPart === "" ? "0" : Number(intPart).toLocaleString("en-US");

  if (decPart !== null) {
    return `${formattedInt}.${decPart}`;
  }
  return formattedInt;
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
  const { terminalInfo } = useActiveTerminal();
  const [step, setStep] = useState<ModalStep>("loading");
  const [session, setSession] = useState<CashSession | null>(null);
  const [shiftLabel, setShiftLabel] = useState("Day Shift");
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [actualCashInput, setActualCashInput] = useState("");
  const [isEODClose, setIsEODClose] = useState(false);
  const [result, setResult] = useState<CloseSessionResult | null>(null);
  const [zReadingResult, setZReadingResult] = useState<ZReadingRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load session on open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStep("loading");
    setError(null);
    setResult(null);
    setZReadingResult(null);
    setIsEODClose(false);
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

  const [printingXReading, setPrintingXReading] = useState(false);
  const [printingZReading, setPrintingZReading] = useState(false);

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
        terminalId: terminalInfo.terminalCode,
        posMin: terminalInfo.posMin,
        posSerial: terminalInfo.posSerial,
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

  // ── End shift & optional Z-Reading handler ────────────────────────────────
  const handleEndShift = async () => {
    setError(null);
    const amount = parsePeso(actualCashInput);
    if (amount === null || amount < 0) {
      setError("Please enter the total cash amount in the drawer.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Close cashier shift & submit cash count
      const res = await closeSession({ actual_cash: amount });
      setResult(res);

      // Auto-print official X-Reading slip immediately upon submission
      try {
        await handlePrintXReading(session?.id);
      } catch (xErr) {
        console.warn("Auto-print X-Reading warning:", xErr);
      }

      // 2. If EOD is checked, atomically commit and print the BIR Z-Reading
      if (isEODClose) {
        try {
          const zRes = await createZReading();
          const fullZ = await getZReading(zRes.id);
          setZReadingResult(fullZ);
          
          // Print official Z-Reading slip
          const settings = await getSettings().catch(() => ({}) as StoreSettings);
          const formattedZ = formatZReadingText({
            zCounterNo: fullZ.z_counter_no,
            resetCounterNo: fullZ.reset_counter_no,
            terminalId: terminalInfo.terminalCode,
            posMin: terminalInfo.posMin,
            posSerial: terminalInfo.posSerial,
            readingDate: fullZ.reading_date,
            generatedByName: fullZ.generated_by_name || "Cashier",
            openedAt: fullZ.opened_at,
            closedAt: fullZ.closed_at,
            begInvoiceNo: fullZ.beg_invoice_no,
            endInvoiceNo: fullZ.end_invoice_no,
            begVoidNo: fullZ.beg_void_no,
            endVoidNo: fullZ.end_void_no,
            begReturnNo: fullZ.beg_return_no,
            endReturnNo: fullZ.end_return_no,
            dailyGrossSales: fullZ.daily_gross_sales,
            totalReturns: fullZ.total_returns,
            totalVoids: fullZ.total_voids,
            scDiscount: fullZ.sc_discount,
            pwdDiscount: fullZ.pwd_discount,
            regularDiscount: fullZ.regular_discount,
            totalDiscounts: fullZ.total_discounts,
            netSales: fullZ.net_sales,
            vatableSales: fullZ.vatable_sales,
            vatAmount: fullZ.vat_amount,
            vatExemptSales: fullZ.vat_exempt_sales,
            zeroRatedSales: fullZ.zero_rated_sales,
            nonVatSales: fullZ.non_vat_sales,
            cashSales: fullZ.cash_sales,
            creditSales: fullZ.credit_sales,
            oldGrandTotal: fullZ.old_grand_total,
            newGrandTotal: fullZ.new_grand_total,
            transactionCount: fullZ.transaction_count,
            voidCount: fullZ.void_count,
            returnCount: fullZ.return_count,
            settings: settings as StoreSettings,
          });
          printThermalMonospace(formattedZ);
          toast.success(`Official Z-Reading #${pad4(fullZ.z_counter_no)} committed & sent to printer!`);
        } catch (zErr: any) {
          console.error("Z-Reading execution error during shift close:", zErr);
          toast.warning("Shift closed, but Z-Reading failed: " + (zErr?.response?.data?.message || zErr?.message));
        }
      }

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

  const handlePrintZReading = async () => {
    if (!zReadingResult) return;
    setPrintingZReading(true);
    try {
      const settings = await getSettings().catch(() => ({}) as StoreSettings);
      const formattedZ = formatZReadingText({
        zCounterNo: zReadingResult.z_counter_no,
        resetCounterNo: zReadingResult.reset_counter_no,
        terminalId: terminalInfo.terminalCode,
        posMin: terminalInfo.posMin,
        posSerial: terminalInfo.posSerial,
        readingDate: zReadingResult.reading_date,
        generatedByName: zReadingResult.generated_by_name || "Cashier",
        openedAt: zReadingResult.opened_at,
        closedAt: zReadingResult.closed_at,
        begInvoiceNo: zReadingResult.beg_invoice_no,
        endInvoiceNo: zReadingResult.end_invoice_no,
        begVoidNo: zReadingResult.beg_void_no,
        endVoidNo: zReadingResult.end_void_no,
        begReturnNo: zReadingResult.beg_return_no,
        endReturnNo: zReadingResult.end_return_no,
        dailyGrossSales: zReadingResult.daily_gross_sales,
        totalReturns: zReadingResult.total_returns,
        totalVoids: zReadingResult.total_voids,
        scDiscount: zReadingResult.sc_discount,
        pwdDiscount: zReadingResult.pwd_discount,
        regularDiscount: zReadingResult.regular_discount,
        totalDiscounts: zReadingResult.total_discounts,
        netSales: zReadingResult.net_sales,
        vatableSales: zReadingResult.vatable_sales,
        vatAmount: zReadingResult.vat_amount,
        vatExemptSales: zReadingResult.vat_exempt_sales,
        zeroRatedSales: zReadingResult.zero_rated_sales,
        nonVatSales: zReadingResult.non_vat_sales,
        cashSales: zReadingResult.cash_sales,
        creditSales: zReadingResult.credit_sales,
        oldGrandTotal: zReadingResult.old_grand_total,
        newGrandTotal: zReadingResult.new_grand_total,
        transactionCount: zReadingResult.transaction_count,
        voidCount: zReadingResult.void_count,
        returnCount: zReadingResult.return_count,
        settings: settings as StoreSettings,
      });
      printThermalMonospace(formattedZ);
      toast.success("Z-Reading re-sent to thermal printer.");
    } catch (err) {
      console.error("Print Z-Reading error:", err);
      toast.error("Failed to print Z-Reading.");
    } finally {
      setPrintingZReading(false);
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
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={openingCashInput}
                    onChange={(e) => setOpeningCashInput(formatCurrencyInput(e.target.value))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleOpenShift(); }}
                    className="w-full h-12 border-2 border-gray-300 rounded-md pl-7 pr-3 text-lg font-bold text-right focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(formatCurrencyInput(e.target.value))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleEndShift(); }}
                    className="w-full h-14 border-2 border-gray-300 rounded-md pl-7 pr-3 text-xl font-bold text-right focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  Enter the total amount of all physical cash counted in the drawer.
                </p>
              </div>

              {/* ── Close Store & Execute Z-Reading Checkbox (Unchecked by default) ─────────────── */}
              <label className="flex items-start gap-3 p-3 rounded-xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-50 cursor-pointer transition-colors select-none">
                <input
                  type="checkbox"
                  checked={isEODClose}
                  onChange={(e) => setIsEODClose(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="text-xs space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Close Store & Generate Daily Z-Reading (EOD)</span>
                  </div>
                  <p className="text-indigo-700/90 leading-relaxed">
                    <strong>Optional:</strong> Leave unchecked for regular shift handovers, breaks, or emergency end-shifts. Only check this when closing the store at the end of the business day.
                  </p>
                </div>
              </label>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  className={`flex-1 font-semibold text-white ${
                    isEODClose ? "bg-indigo-600 hover:bg-indigo-700" : "bg-red-600 hover:bg-red-700"
                  }`}
                  onClick={handleEndShift}
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      {isEODClose ? "Closing EOD…" : "Submitting…"}
                    </span>
                  ) : isEODClose ? (
                    "End Shift & Run Z-Reading"
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

              {/* Z-Reading Status Card if EOD was executed */}
              {zReadingResult && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-900">
                      <FileCheck className="h-4 w-4 text-indigo-600" />
                      Official BIR Z-Reading #{pad4(zReadingResult.z_counter_no)} Committed
                    </span>
                    <span className="text-[10px] bg-indigo-200 text-indigo-900 font-mono px-1.5 py-0.5 rounded font-bold">
                      EOD Locked
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-indigo-800">
                    <span>New Grand Total (GT):</span>
                    <span className="font-bold tabular-nums">₱{fmt(zReadingResult.new_grand_total)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
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

                {zReadingResult && (
                  <Button
                    type="button"
                    className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                    onClick={handlePrintZReading}
                    disabled={printingZReading}
                  >
                    <Printer className="h-4 w-4 text-white" />
                    {printingZReading ? "Printing Z-Reading…" : `Reprint Z-Reading #${pad4(zReadingResult.z_counter_no)}`}
                  </Button>
                )}
              </div>

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
