import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, Receipt, ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";

export interface PaymentSuccessData {
  invoiceNumber: string;
  totalAmount: number;
  cashTendered: number;
  changeAmount: number;
  customerName?: string;
}

interface PaymentSuccessModalProps {
  open: boolean;
  onClose: () => void;
  data: PaymentSuccessData | null;
}

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentSuccessModal({ open, onClose, data }: PaymentSuccessModalProps) {
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      // Focus the next transaction button automatically so pressing Enter moves on immediately
      const timer = setTimeout(() => {
        nextButtonRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!data) return null;

  const isExact = Math.abs(data.changeAmount) < 0.001;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-2 border-emerald-500/30 shadow-2xl rounded-2xl">
        {/* Header decoration */}
        <div className="bg-gradient-to-b from-emerald-50 to-white px-6 pt-6 pb-4 text-center border-b border-emerald-100">
          <div className="mx-auto w-14 h-14 bg-emerald-100 border-2 border-emerald-300 rounded-full flex items-center justify-center mb-3 shadow-inner">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 animate-in zoom-in-50 duration-200" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Payment Complete!</h2>
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 mt-1">
            <Receipt className="w-3.5 h-3.5" />
            <span>Invoice:</span>
            <span className="font-mono font-bold text-slate-700">{data.invoiceNumber}</span>
            {data.customerName && (
              <>
                <span className="text-slate-300">·</span>
                <span className="truncate max-w-[150px]">{data.customerName}</span>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Main Change Due Tile */}
          <div
            className={`rounded-xl p-5 text-center border-2 shadow-sm transition-all ${
              isExact
                ? "bg-blue-50/80 border-blue-200"
                : "bg-emerald-50 border-emerald-300"
            }`}
          >
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                isExact ? "text-blue-700" : "text-emerald-800"
              }`}
            >
              {isExact ? "Exact Payment" : "Change Due"}
            </span>
            <div
              className={`text-4xl font-extrabold tabular-nums tracking-tight mt-1 ${
                isExact ? "text-blue-600" : "text-emerald-600"
              }`}
            >
              {fmt(data.changeAmount)}
            </div>
            {isExact && (
              <p className="text-xs text-blue-600 mt-1 font-medium">No change needed</p>
            )}
          </div>

          {/* Payment Breakdown Cards */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <span className="text-xs text-slate-500 font-medium block">Total Payable</span>
              <span className="text-base font-bold text-slate-900 tabular-nums mt-0.5 block">
                {fmt(data.totalAmount)}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <span className="text-xs text-slate-500 font-medium block">Cash Received</span>
              <span className="text-base font-bold text-slate-900 tabular-nums mt-0.5 block">
                {fmt(data.cashTendered)}
              </span>
            </div>
          </div>

          {/* Action button */}
          <div className="pt-2">
            <Button
              ref={nextButtonRef}
              onClick={onClose}
              className="w-full h-12 text-base font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-md gap-2 transition-all"
            >
              <span>Next Transaction</span>
              <span className="text-xs bg-emerald-700/60 px-2 py-0.5 rounded font-mono font-normal">Enter ↵</span>
              <ArrowRight className="w-4 h-4 ml-0.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
