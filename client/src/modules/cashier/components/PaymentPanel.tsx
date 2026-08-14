import { Button } from "@/components/ui/button";
import { Ban, Loader2, PauseCircle, Percent, RotateCcw } from "lucide-react";
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

  return (
    <div className="w-80 shrink-0 flex flex-col gap-3 min-h-0">
      <div className="shrink-0 bg-slate-50 rounded-xl border-2 border-slate-400 shadow-sm px-4 py-3 space-y-2">
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

        <div className="border-t border-dashed border-slate-300 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-800 uppercase tracking-wide">Cash Tendered</label>
            <span className="text-[10px] font-mono text-slate-500 bg-slate-200 px-1 py-0.5 rounded font-medium">
              F8 / Alt+P
            </span>
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
      </div>

      <div className="flex-1 flex flex-col justify-end gap-2.5">
        <Button
          className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-lg gap-2 shadow-sm border border-emerald-700/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={noShift || cartLength === 0 || cashCents < finalTotalCents || !customerName.trim() || isProcessing || isOffline || pendingApproval}
          onClick={onProcessPayment}
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-5 w-5 flex items-center justify-center font-bold text-base">₱</span>}
          {isProcessing
            ? "Processing..."
            : noShift
            ? "Start Shift to Transact"
            : isOffline
            ? "Server Unreachable"
            : pendingApproval
            ? "Waiting for Approval…"
            : !customerName.trim()
            ? "Enter Customer Name"
            : cashCents > 0 && cashCents < finalTotalCents
            ? "Insufficient Cash"
            : "Process Payment (Enter ↵)"}
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
          {noShift && (
            <p className="text-xs text-center text-amber-600 font-semibold">
              You must <span className="underline">Start Shift</span> before processing transactions.
            </p>
          )}
          {!noShift && cartLength > 0 && !customerName.trim() && (
            <p className="text-xs text-center text-amber-600">
              Fill in <span className="font-semibold">Sold To</span> to proceed
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
