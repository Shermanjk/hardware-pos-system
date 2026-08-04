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
}

export default function PaymentPanel({
  subtotalCents, taxCents, totalCents, taxRate,
  cashTendered, setCashTendered,
  cartLength, customerName, isProcessing, isOffline,
  pendingApproval = false,
  onProcessPayment, onHold, onHoldOrders, onReturn, onPendingReturns, onVoid, onVoidRequests,
  pendingReturnsCount, hasApprovedReturns, pendingVoidRequestsCount, pendingHeldOrdersCount,
  discountCents = 0, discountName, discountPercentage, finalTotalCents = totalCents,
}: PaymentPanelProps) {
  const cashCents   = parseCashInput(cashTendered);
  const changeCents = cashCents >= finalTotalCents ? cashCents - finalTotalCents : null;
  const isExact     = cashCents === finalTotalCents;

  return (
    <div className="w-80 shrink-0 flex flex-col gap-3 min-h-0">
      <div className="shrink-0 bg-white rounded-xl border-2 border-gray-300 shadow-sm px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span className="font-medium tabular-nums">₱{fmtCents(subtotalCents)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>VAT ({taxRate}%)</span>
          <span className="font-medium tabular-nums">₱{fmtCents(taxCents)}</span>
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
        
        <div className="border-t border-gray-200 pt-3 flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</span>
          <span className="font-bold text-blue-600 tabular-nums leading-none" style={{ fontSize: "2.5rem" }}>
            ₱{fmtCents(finalTotalCents)}
          </span>
        </div>

        <div className="border-t border-dashed border-gray-200 pt-3 space-y-2">
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">Cash Tendered</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold pointer-events-none select-none" style={{ fontSize: "1.4rem", lineHeight: 1, color: "#6b7280" }}>₱</span>
            <input
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
                  : "border-gray-400 bg-white focus:border-blue-500 focus:ring-blue-100 text-gray-900"
                }`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && cartLength > 0 && cashCents >= finalTotalCents && customerName.trim()) {
                  onProcessPayment();
                }
              }}
            />
          </div>

          {cashCents > 0 && cashCents < finalTotalCents && (
            <div className="flex justify-between text-xs text-red-600 font-medium bg-red-50 rounded-lg px-3 py-1.5">
              <span>Short by</span>
              <span className="tabular-nums">₱{fmtCents(finalTotalCents - cashCents)}</span>
            </div>
          )}

          {changeCents !== null && (
            <div className={`flex justify-between items-baseline rounded-lg px-3 py-2 ${isExact ? "bg-blue-50 border border-blue-200" : "bg-green-50 border border-green-200"}`}>
              <span className={`text-sm font-bold ${isExact ? "text-blue-700" : "text-green-700"}`}>
                {isExact ? "Exact Change" : "Change"}
              </span>
              <span className={`text-2xl font-bold tabular-nums ${isExact ? "text-blue-600" : "text-green-600"}`}>
                ₱{fmtCents(changeCents)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-end gap-2">
        <Button
          className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-xl gap-2 disabled:opacity-50"
          disabled={cartLength === 0 || cashCents < finalTotalCents || !customerName.trim() || isProcessing || isOffline || pendingApproval}
          onClick={onProcessPayment}
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-5 w-5 flex items-center justify-center">₱</span>}
          {isProcessing
            ? "Processing..."
            : isOffline
            ? "Server Unreachable"
            : pendingApproval
            ? "Waiting for Approval…"
            : !customerName.trim()
            ? "Enter Customer Name"
            : cashCents > 0 && cashCents < finalTotalCents
            ? "Insufficient Cash"
            : "Process Payment"}
        </Button>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="relative h-10 text-sm rounded-xl gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={onHold}
              disabled={cartLength === 0 || !customerName.trim()}
            >
              <PauseCircle className="h-4 w-4" /> Hold
            </Button>
            <Button
              variant="outline"
              className="relative h-10 text-sm rounded-xl gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50"
              onClick={onHoldOrders}
            >
              <PauseCircle className="h-4 w-4" /> Held Transactions
              {pendingHeldOrdersCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 text-white text-xs font-bold">
                  {pendingHeldOrdersCount}
                </span>
              )}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* BUG-08 FIX: Return button opens pending-returns panel when approved returns exist,
                otherwise opens the new-return submission panel. */}
            <Button
              variant="outline"
              className="relative h-10 text-sm rounded-xl gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
              onClick={hasApprovedReturns ? onPendingReturns : onReturn}
            >
              <RotateCcw className="h-4 w-4" /> {hasApprovedReturns ? "Process Return" : "Return"}
              {pendingReturnsCount > 0 && (
                <span className={`absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-xs font-bold ${hasApprovedReturns ? "bg-green-500" : "bg-purple-500"}`}>
                  {pendingReturnsCount}
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              className="relative h-10 text-sm rounded-xl gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
              onClick={onVoidRequests}
            >
              <Ban className="h-4 w-4" /> Void Requests
              {pendingVoidRequestsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-xs font-bold">
                  {pendingVoidRequestsCount}
                </span>
              )}
            </Button>
          </div>
          {cartLength > 0 && !customerName.trim() && (
            <p className="text-xs text-center text-amber-600">
              Fill in <span className="font-semibold">Sold To</span> to proceed
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
