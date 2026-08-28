import { Button } from "@/components/ui/button";
import { Ban, CreditCard, HandCoins, Loader2, PauseCircle, Percent, RotateCcw } from "lucide-react";
import PesoSign from "@/shared/components/PesoSign";
import { fmtCents, formatCashDisplay, parseCashInput } from "../utils/money";

interface PaymentPanelProps {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxRate: number;
  cashTendered: string;
  setCashTendered: React.Dispatch<React.SetStateAction<string>>;
  cartLength: number;
  customerName: string;
  isProcessing: boolean;
  /** When true the server is unreachable — payment button is disabled. */
  isOffline: boolean;
  /** When true no shift session is open — all transaction actions are blocked. */
  noShift?: boolean;
  /** When true a discount approval request is pending — payment button shows waiting state. */
  pendingApproval?: boolean;
  onProcessPayment: () => void;
  onHold: () => void;
  onHoldOrders: () => void;
  onReturn: () => void;
  onPendingReturns: () => void;
  onVoid: () => void;
  onVoidRequests: () => void;
  pendingReturnsCount: number;
  hasApprovedReturns: boolean;
  pendingVoidRequestsCount: number;
  pendingHeldOrdersCount: number;
  discountCents?: number;
  discountName?: string;
  discountPercentage?: number;
  finalTotalCents?: number;
  /** VAT-exempt amount for SC/PWD transactions (VAT-exclusive base). */
  vatExemptCents?: number;
  /** SC/PWD type — "NONE" for regular customers. */
  scPwdType?: "NONE" | "SENIOR_CITIZEN" | "PWD";
  /** SC/PWD ID number. */
  scPwdId?: string;
  // ── Credit / Utang ───────────────────────────────────────────────────────
  paymentMode: "CASH" | "CREDIT" | "COLLECT_UTANG";
  onSetPaymentMode: (mode: "CASH" | "CREDIT" | "COLLECT_UTANG") => void;
  /** Down payment amount (in pesos) for credit sales */
  downPayment: string;
  setDownPayment: React.Dispatch<React.SetStateAction<string>>;
  /** Credit limit state for the selected customer */
  creditLimit: number;
  creditBalance: number;
  creditEnabled: boolean;
  /** Whether a credit limit override request is in-flight */
  pendingCreditOverride?: boolean;
  // ── Utang payment collection state ───────────────────────────────────────
  utangPaymentAmount: string;
  setUtangPaymentAmount: React.Dispatch<React.SetStateAction<string>>;
  utangPaymentNotes: string;
  setUtangPaymentNotes: React.Dispatch<React.SetStateAction<string>>;
  onProcessUtangPayment: () => void;
}

export default function PaymentPanel({
  subtotalCents, taxCents, totalCents, taxRate,
  cashTendered, setCashTendered,
  cartLength, customerName, isProcessing, isOffline,
  noShift = false,
  pendingApproval = false,
  onProcessPayment, onHold, onHoldOrders, onReturn, onPendingReturns, onVoid, onVoidRequests,
  pendingReturnsCount, hasApprovedReturns, pendingVoidRequestsCount, pendingHeldOrdersCount,
  discountCents = 0, discountName, discountPercentage, finalTotalCents = totalCents,
  vatExemptCents = 0, scPwdType = "NONE", scPwdId,
  paymentMode, onSetPaymentMode,
  downPayment, setDownPayment,
  creditLimit, creditBalance, creditEnabled,
  pendingCreditOverride = false,
  utangPaymentAmount, setUtangPaymentAmount,
  utangPaymentNotes, setUtangPaymentNotes,
  onProcessUtangPayment,
}: PaymentPanelProps) {
  const isScPwd = scPwdType !== "NONE";
  const scPwdLabel = scPwdType === "SENIOR_CITIZEN" ? "Senior Citizen" : scPwdType === "PWD" ? "PWD" : "";
  // For SC/PWD, the displayed VAT is 0 (VAT-exempt). For regular: the customer's VAT.
  const displayTaxCents = isScPwd ? 0 : taxCents;
  // For SC/PWD, the gross is the VAT-exclusive base. For regular: VAT-inclusive total.
  const displayGrossCents = isScPwd ? vatExemptCents : totalCents;
  const cashCents   = parseCashInput(cashTendered);
  const changeCents = cashCents >= finalTotalCents ? cashCents - finalTotalCents : null;
  const isExact     = cashCents === finalTotalCents;

  // ── Credit-specific calculations ──────────────────────────────────────────
  const downPaymentCents = parseCashInput(downPayment);
  const creditAmountCents = Math.max(0, finalTotalCents - downPaymentCents);
  const projectedBalanceCents = Math.round((creditBalance * 100) + creditAmountCents);
  const creditLimitCents = Math.round(creditLimit * 100);
  const wouldExceedLimit = creditEnabled && creditLimitCents > 0 && projectedBalanceCents > creditLimitCents;

  // ── Utang payment collection calculations ────────────────────────────────
  const isCollectUtang = paymentMode === "COLLECT_UTANG";
  const utangCurrentBalanceCents = Math.round(creditBalance * 100);
  const utangPaymentCents = parseCashInput(utangPaymentAmount);
  const utangRemainingBalanceCents = Math.max(0, utangCurrentBalanceCents - utangPaymentCents);
  const isUtangOverpaying = utangPaymentCents > utangCurrentBalanceCents;
  const canPayUtang = isCollectUtang && customerName.trim() && utangCurrentBalanceCents > 0 && utangPaymentCents > 0 && !isUtangOverpaying;

  // ── Payment button state ───────────────────────────────────────────────────
  const isCredit = paymentMode === "CREDIT";
  const creditReady = isCredit && customerName.trim() && creditEnabled && cartLength > 0;
  const cashReady = paymentMode === "CASH" && cashCents >= finalTotalCents && customerName.trim() && cartLength > 0;

  const canPay = isCollectUtang ? canPayUtang : isCredit ? creditReady : cashReady;

  function getButtonLabel(): string {
    if (isProcessing) return "Processing...";
    if (noShift) return "Start Shift to Transact";
    if (isOffline) return "Server Unreachable";
    if (isCollectUtang) {
      if (!customerName.trim()) return "Select a Customer";
      if (utangCurrentBalanceCents <= 0) return "Customer Has No Utang (₱0.00)";
      if (utangPaymentCents <= 0) return "Enter Payment Amount";
      if (isUtangOverpaying) return "Payment Exceeds Balance";
      return "Process Payment";
    }
    if (pendingApproval) return "Waiting for Discount Approval…";
    if (pendingCreditOverride) return "Waiting for Credit Override…";
    if (cartLength === 0) return "Process Payment";
    if (!customerName.trim()) return "Select a Customer";
    if (isCredit && !creditEnabled) return "Credit Not Enabled for Customer";
    if (isCredit && wouldExceedLimit && !pendingCreditOverride) return "Credit Limit Exceeded — Override Required";
    if (!isCredit && cashCents > 0 && cashCents < finalTotalCents) return "Insufficient Cash";
    return "Process Payment";
  }

  return (
    <div className="w-80 shrink-0 flex flex-col gap-3 min-h-0">
      {/* ── Payment Mode Toggle (3 Modes) ─────────────────────────────────── */}
      <div className="shrink-0 bg-white rounded-xl border-2 border-slate-300 shadow-sm p-1.5 flex gap-1">
        <button
          type="button"
          onClick={() => onSetPaymentMode("CASH")}
          className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
            paymentMode === "CASH"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <PesoSign className="text-sm font-bold" />
          <span>Cash</span>
        </button>
        <button
          type="button"
          onClick={() => onSetPaymentMode("CREDIT")}
          className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
            paymentMode === "CREDIT"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <CreditCard className="h-3.5 w-3.5" />
          <span>Credit Sale</span>
        </button>
        <button
          type="button"
          onClick={() => onSetPaymentMode("COLLECT_UTANG")}
          className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
            paymentMode === "COLLECT_UTANG"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <HandCoins className="h-3.5 w-3.5" />
          <span>Pay Utang</span>
        </button>
      </div>

      <div className="shrink-0 bg-slate-50 rounded-xl border-2 border-slate-400 shadow-sm px-4 py-3 space-y-2">
        {isCollectUtang ? (
          /* ── COLLECT UTANG MODE UI ────────────────────────────────────────── */
          <div className="space-y-3">
            {/* Customer Account Summary Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-baseline">
                <span className="text-slate-600 font-medium">Customer</span>
                <span className="font-bold text-slate-900 text-sm truncate max-w-[150px]">
                  {customerName || "No Customer Selected"}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-600 font-medium">Current Utang</span>
                <span className="font-extrabold text-rose-600 text-base tabular-nums">
                  ₱{fmtCents(utangCurrentBalanceCents)}
                </span>
              </div>
              {creditLimitCents > 0 && (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Credit Limit</span>
                  <span className="font-semibold tabular-nums">₱{fmtCents(creditLimitCents)}</span>
                </div>
              )}
            </div>

            {/* Payment Amount Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Payment Amount
                </label>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-200 px-1 py-0.5 rounded font-medium">
                  F8 / Alt+P
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold pointer-events-none select-none text-slate-500" style={{ fontSize: "1.4rem", lineHeight: 1 }}>₱</span>
                <input
                  id="utang-payment-input"
                  type="text"
                  inputMode="decimal"
                  value={utangPaymentAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, "");
                    if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                      setUtangPaymentAmount(formatCashDisplay(e.target.value));
                    }
                  }}
                  placeholder="0.00"
                  style={{ fontSize: "1.75rem", lineHeight: 1 }}
                  className={`w-full rounded-md border px-4 pl-12 pr-4 h-14 font-bold text-right tabular-nums tracking-tight outline-none transition-colors focus:ring-2 focus:ring-offset-0
                    ${isUtangOverpaying
                      ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200 text-red-700"
                      : utangPaymentCents > 0
                      ? "border-green-400 bg-green-50 focus:border-green-500 focus:ring-green-200 text-green-700"
                      : "border-slate-400 bg-white focus:border-blue-500 focus:ring-blue-100 text-slate-900"
                    }`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canPayUtang && !noShift && !isOffline && !isProcessing) {
                      e.preventDefault();
                      onProcessUtangPayment();
                    }
                  }}
                />
              </div>
            </div>

            {/* Overpayment Warning */}
            {isUtangOverpaying && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs font-semibold text-center">
                ⚠️ Payment exceeds outstanding balance of ₱{fmtCents(utangCurrentBalanceCents)}
              </div>
            )}

            {/* Live Remaining Balance Calculation */}
            {utangPaymentCents > 0 && !isUtangOverpaying && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Amount Paying</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    -₱{fmtCents(utangPaymentCents)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-emerald-200 text-sm">
                  <span>New Balance</span>
                  <span className={`tabular-nums ${utangRemainingBalanceCents === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    ₱{fmtCents(utangRemainingBalanceCents)} {utangRemainingBalanceCents === 0 ? "(Fully Settled)" : ""}
                  </span>
                </div>
              </div>
            )}

            {/* Notes / Reference */}
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600">
                Notes / Reference (Optional)
              </label>
              <input
                type="text"
                value={utangPaymentNotes}
                onChange={(e) => setUtangPaymentNotes(e.target.value)}
                placeholder="e.g. Cash / GCash Ref #"
                className="w-full h-8 px-2.5 text-xs rounded-md border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        ) : (
          /* ── CASH AND CREDIT SALE BREAKDOWN ───────────────────────────────── */
          <>
            {isScPwd && (
              <div className="flex items-center justify-between text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
                <span>{scPwdLabel}</span>
                <span className="font-mono">{scPwdId || "—"}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-slate-700">
              <span>Gross Amount (incl. VAT)</span>
              <span className="font-medium tabular-nums">₱{fmtCents(totalCents)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-700">
              <span>VATable Sales (Net Base)</span>
              <span className="font-medium tabular-nums">₱{fmtCents(isScPwd ? vatExemptCents : subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-700">
              <span>{isScPwd ? "VAT (Exempt)" : `VAT (${taxRate}%)`}</span>
              <span className="font-medium tabular-nums">₱{fmtCents(displayTaxCents)}</span>
            </div>

            {discountCents > 0 && (
              <div className="flex justify-between text-sm text-amber-600">
                <div className="flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5" />
                  <span>{discountName || "Discount"} ({discountPercentage}%)</span>
                </div>
                <span className="font-medium tabular-nums">-₱{fmtCents(discountCents)}</span>
              </div>
            )}

            <div className="border-t border-slate-300 pt-3 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Amount Payable</span>
              <span className="font-bold text-blue-600 tabular-nums leading-none" style={{ fontSize: "2.5rem" }}>
                ₱{fmtCents(finalTotalCents)}
              </span>
            </div>

            {/* ── CASH mode: cash tendered input ─────────────────────────────── */}
            {!isCredit && (
              <div className="border-t border-dashed border-slate-300 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wide">Cash Tendered</label>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-200 px-1 py-0.5 rounded font-medium">F8 / Alt+P</span>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold pointer-events-none select-none" style={{ fontSize: "1.4rem", lineHeight: 1, color: "#475569" }}>₱</span>
                  <input
                    id="cash-tendered-input"
                    type="text"
                    inputMode="decimal"
                    value={cashTendered}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, "");
                      if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                        setCashTendered(formatCashDisplay(e.target.value));
                      }
                    }}
                    placeholder="0.00"
                    style={{ fontSize: "1.75rem", lineHeight: 1 }}
                    className={`w-full rounded-md border px-4 pl-12 pr-4 h-14 font-bold text-right tabular-nums tracking-tight outline-none transition-colors focus:ring-2 focus:ring-offset-0
                      ${cashCents > 0 && cashCents < finalTotalCents
                        ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200 text-red-700"
                        : cashCents >= finalTotalCents && cashCents > 0
                        ? "border-green-400 bg-green-50 focus:border-green-500 focus:ring-green-200 text-green-700"
                        : "border-slate-400 bg-white focus:border-blue-500 focus:ring-blue-100 text-slate-900"
                      }`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && cartLength > 0 && cashCents >= finalTotalCents && customerName.trim()) {
                        e.preventDefault();
                        onProcessPayment();
                      }
                    }}
                  />
                </div>

                {cashCents > 0 && cashCents < finalTotalCents && (
                  <div className="flex justify-between items-center text-xs text-rose-700 font-semibold bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 shadow-xs">
                    <span className="flex items-center gap-1">⚠️ Short by</span>
                    <span className="tabular-nums font-bold text-rose-700 text-sm">₱{fmtCents(finalTotalCents - cashCents)}</span>
                  </div>
                )}

                {changeCents !== null && (
                  <div className={`flex justify-between items-baseline rounded-lg px-3.5 py-2.5 shadow-xs border ${isExact ? "bg-blue-50/90 border-blue-200" : "bg-emerald-50 border-emerald-300"}`}>
                    <span className={`text-xs font-bold uppercase tracking-wider ${isExact ? "text-blue-800" : "text-emerald-800"}`}>
                      {isExact ? "Exact Payment" : "Change Due"}
                    </span>
                    <span className={`text-2xl font-black tabular-nums tracking-tight ${isExact ? "text-blue-600" : "text-emerald-600"}`}>
                      ₱{fmtCents(changeCents)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── CREDIT mode: down payment input + balance preview ────────── */}
            {isCredit && (
              <div className="border-t border-dashed border-slate-300 pt-3 space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wide mb-1">
                    Down Payment <span className="text-slate-400 font-normal normal-case">(optional, ₱0 = full credit)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold pointer-events-none select-none text-slate-500" style={{ fontSize: "1.4rem", lineHeight: 1 }}>₱</span>
                    <input
                      id="down-payment-input"
                      type="text"
                      inputMode="decimal"
                      value={downPayment}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, "");
                        if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                          setDownPayment(formatCashDisplay(e.target.value));
                        }
                      }}
                      placeholder="0.00"
                      style={{ fontSize: "1.75rem", lineHeight: 1 }}
                      className="w-full rounded-md border border-slate-400 bg-white px-4 pl-12 pr-4 h-14 font-bold text-right tabular-nums tracking-tight outline-none transition-colors focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-slate-900"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canPay && !noShift && !isOffline && !pendingApproval) {
                          e.preventDefault();
                          onProcessPayment();
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Credit amount summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-2.5 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Amount on Credit</span>
                    <span className="font-bold text-blue-700">₱{fmtCents(creditAmountCents)}</span>
                  </div>
                  {creditEnabled && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Current Balance</span>
                        <span className="font-semibold text-slate-700">₱{fmtCents(Math.round(creditBalance * 100))}</span>
                      </div>
                      <div className={`flex justify-between font-bold border-t border-blue-200 pt-1.5 ${wouldExceedLimit ? "text-red-600" : "text-blue-700"}`}>
                        <span>Projected Balance</span>
                        <span>₱{fmtCents(projectedBalanceCents)}</span>
                      </div>
                      {creditLimitCents > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Credit Limit</span>
                          <span>₱{fmtCents(creditLimitCents)}</span>
                        </div>
                      )}
                      {wouldExceedLimit && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700 text-center text-[11px] font-semibold">
                          ⚠️ Exceeds limit by ₱{fmtCents(projectedBalanceCents - creditLimitCents)} — Admin override required
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-end gap-2.5">
        <Button
          className={`w-full h-12 font-bold text-sm rounded-lg gap-2 shadow-sm border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isCollectUtang
              ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border-blue-700/30"
              : isCredit
              ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border-blue-700/30"
              : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white border-emerald-700/30"
          }`}
          disabled={noShift || !canPay || isProcessing || isOffline || pendingApproval || pendingCreditOverride || (isCredit && !creditEnabled) || (isCredit && wouldExceedLimit && !pendingCreditOverride)}
          onClick={isCollectUtang ? onProcessUtangPayment : onProcessPayment}
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            isCollectUtang ? <HandCoins className="h-4 w-4" /> : isCredit ? <CreditCard className="h-4 w-4" /> : <span className="h-5 w-5 flex items-center justify-center font-bold text-base">₱</span>
          )}
          <span>{getButtonLabel()}</span>
          {!isProcessing && canPay && !noShift && (
            <span className="text-[11px] bg-black/20 text-white px-1.5 py-0.5 rounded font-mono font-normal ml-1">Enter ↵</span>
          )}
        </Button>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="relative h-11 text-xs font-semibold rounded-lg gap-1.5 bg-amber-50 hover:bg-amber-100/90 active:bg-amber-200/80 text-amber-900 border border-amber-300 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed justify-between px-3"
              onClick={onHold}
              disabled={noShift || cartLength === 0 || !customerName.trim()}
            >
              <div className="flex items-center gap-1.5">
                <PauseCircle className="h-4 w-4 text-amber-700 shrink-0" />
                <span>Hold</span>
              </div>
              <span className="font-mono text-[10px] bg-amber-200/80 text-amber-900 px-1 py-0.5 rounded">F5</span>
            </Button>
            <Button
              className="relative h-11 text-xs font-semibold rounded-lg gap-1.5 bg-orange-50 hover:bg-orange-100/90 active:bg-orange-200/80 text-orange-900 border border-orange-300 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed justify-between px-3"
              onClick={onHoldOrders}
              disabled={noShift}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <PauseCircle className="h-4 w-4 text-orange-700 shrink-0" />
                <span className="truncate">Held Orders</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="font-mono text-[10px] bg-orange-200/80 text-orange-900 px-1 py-0.5 rounded">F6</span>
                {pendingHeldOrdersCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-orange-600 text-white text-[10px] font-bold">
                    {pendingHeldOrdersCount}
                  </span>
                )}
              </div>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="relative h-11 text-xs font-semibold rounded-lg gap-1.5 bg-indigo-50 hover:bg-indigo-100/90 active:bg-indigo-200/80 text-indigo-900 border border-indigo-300 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed justify-between px-3"
              onClick={hasApprovedReturns ? onPendingReturns : onReturn}
              disabled={noShift}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <RotateCcw className="h-4 w-4 text-indigo-700 shrink-0" />
                <span className="truncate">{hasApprovedReturns ? "Returns" : "Return"}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="font-mono text-[10px] bg-indigo-200/80 text-indigo-900 px-1 py-0.5 rounded">F7</span>
                {pendingReturnsCount > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-white text-[10px] font-bold ${hasApprovedReturns ? "bg-emerald-600" : "bg-indigo-600"}`}>
                    {pendingReturnsCount}
                  </span>
                )}
              </div>
            </Button>
            <Button
              className="relative h-11 text-xs font-semibold rounded-lg gap-1.5 bg-rose-50 hover:bg-rose-100/90 active:bg-rose-200/80 text-rose-900 border border-rose-300 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed justify-between px-3"
              onClick={onVoidRequests}
              disabled={noShift}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Ban className="h-4 w-4 text-rose-700 shrink-0" />
                <span className="truncate">Void Reqs</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="font-mono text-[10px] bg-rose-200/80 text-rose-900 px-1 py-0.5 rounded">F9</span>
                {pendingVoidRequestsCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                    {pendingVoidRequestsCount}
                  </span>
                )}
              </div>
            </Button>
          </div>
          {isOffline && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-2 text-xs text-red-700 font-semibold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
              <span>Server Unreachable: Reconnect before processing checkout.</span>
            </div>
          )}
          {noShift && (
            <p className="text-xs text-center text-amber-600 font-semibold">
              You must <span className="underline">Start Shift</span> before processing transactions.
            </p>
          )}
          {!noShift && cartLength > 0 && !customerName.trim() && (
            <p className="text-xs text-center text-amber-600">
              {isCredit ? "Select a credit customer to proceed" : <>Fill in <span className="font-semibold">Sold To</span> to proceed</>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
