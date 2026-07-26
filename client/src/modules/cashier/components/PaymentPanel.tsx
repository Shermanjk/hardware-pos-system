import { Button } from "@/components/ui/button";
import { Loader2, PauseCircle, RotateCcw, Ban } from "lucide-react";
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
  onProcessPayment: () => void;
  onHold: () => void;
  onReturn: () => void;
  onVoid: () => void;
  onVoidRequests: () => void;
  unseenVoidDecisions: number;
}

export default function PaymentPanel({
  subtotalCents, taxCents, totalCents, taxRate,
  cashTendered, setCashTendered,
  cartLength, customerName, isProcessing,
  onProcessPayment, onHold, onReturn, onVoid, onVoidRequests, unseenVoidDecisions,
}: PaymentPanelProps) {
  const cashCents   = parseCashInput(cashTendered);
  const changeCents = cashCents >= totalCents ? cashCents - totalCents : null;
  const isExact     = cashCents === totalCents;

  return (
    <div className="w-80 shrink-0 flex flex-col gap-3 min-h-0">
      <div className="shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span className="font-medium tabular-nums">₱{fmtCents(subtotalCents)}</span>
        </div>
        <div className="flex justify-between text-sm text-gray-600">
          <span>VAT ({taxRate}%)</span>
          <span className="font-medium tabular-nums">₱{fmtCents(taxCents)}</span>
        </div>
        <div className="border-t border-gray-200 pt-3 flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</span>
          <span className="font-bold text-blue-600 tabular-nums leading-none" style={{ fontSize: "2.5rem" }}>
            ₱{fmtCents(totalCents)}
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
                ${cashCents > 0 && cashCents < totalCents
                  ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200 text-red-700"
                  : cashCents >= totalCents && cashCents > 0
                  ? "border-green-400 bg-green-50 focus:border-green-500 focus:ring-green-200 text-green-700"
                  : "border-gray-400 bg-white focus:border-blue-500 focus:ring-blue-100 text-gray-900"
                }`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && cartLength > 0 && cashCents >= totalCents && customerName.trim()) {
                  onProcessPayment();
                }
              }}
            />
          </div>

          {cashCents > 0 && cashCents < totalCents && (
            <div className="flex justify-between text-xs text-red-600 font-medium bg-red-50 rounded-lg px-3 py-1.5">
              <span>Short by</span>
              <span className="tabular-nums">₱{fmtCents(totalCents - cashCents)}</span>
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
          disabled={cartLength === 0 || cashCents < totalCents || !customerName.trim() || isProcessing}
          onClick={onProcessPayment}
        >
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-5 w-5 flex items-center justify-center">₱</span>}
          {isProcessing ? "Processing..." : !customerName.trim() ? "Enter Customer Name" : cashCents > 0 && cashCents < totalCents ? "Insufficient Cash" : "Process Payment"}
        </Button>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="h-10 text-sm rounded-xl gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={onHold}
              disabled={cartLength === 0 || !customerName.trim()}
            >
              <PauseCircle className="h-4 w-4" /> Hold
            </Button>
            <Button
              variant="outline"
              className="h-10 text-sm rounded-xl gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
              onClick={onReturn}
            >
              <RotateCcw className="h-4 w-4" /> Return
            </Button>
            <Button
              variant="outline"
              className="h-10 text-sm rounded-xl gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
              onClick={onVoid}
            >
              <Ban className="h-4 w-4" /> Request Void
            </Button>
            <Button
              variant="outline"
              className="relative h-10 text-sm rounded-xl gap-1.5 border-gray-200 text-gray-600 hover:bg-gray-50"
              onClick={onVoidRequests}
            >
              <Ban className="h-4 w-4" /> Void Requests
              {unseenVoidDecisions > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-xs font-bold">
                  {unseenVoidDecisions}
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
