import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle2, Receipt, ArrowRight, Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  onReprint?: () => void;
}

function fmt(n: number) {
  return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentSuccessModal({ open, onClose, data, onReprint }: PaymentSuccessModalProps) {
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [reprinting, setReprinting] = useState(false);

  useEffect(() => {
    if (open) {
      setReprinting(false);
      // Focus the next transaction button automatically so pressing Enter moves on immediately
      const timer = setTimeout(() => {
        nextButtonRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Support 'R' key for quick reprint while modal is open
  useEffect(() => {
    if (!open || !onReprint) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R" || e.key === "F9") {
        e.preventDefault();
        handleTriggerReprint();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onReprint]);

  const handleTriggerReprint = () => {
    if (!onReprint || reprinting) return;
    setReprinting(true);
    onReprint();
    setTimeout(() => setReprinting(false), 1500);
  };

  if (!data) return null;

  const isExact = Math.abs(data.changeAmount) < 0.001;

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-lg p-0 overflow-hidden border-2 border-emerald-500/30 shadow-2xl rounded-2xl">
        {/* Header decoration */}
        <div className="bg-gradient-to-b from-emerald-50 to-white px-6 pt-6 pb-4 text-center border-b border-emerald-100">
          <div className="mx-auto w-14 h-14 bg-emerald-100 border-2 border-emerald-300 rounded-full flex items-center justify-center mb-3 shadow-inner">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 animate-in zoom-in-50 duration-200" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Payment Complete!</h2>
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 mt-1">
            <Receipt className="w-3.5 h-3.5" />
            <span>Invoice:</span>
            <span className="font-mono font-bold text-slate-700">{data.invoiceNumber ? data.invoiceNumber.replace(/^INV-?/i, "") : ""}</span>
            {data.customerName && (
              <>
                <span className="text-slate-300">·</span>
                <span className="truncate max-w-[180px]">{data.customerName}</span>
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
          <div className="grid grid-cols-2 gap-2.5 text-sm">
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

          {/* Action buttons */}
          <div className="pt-2 flex items-center gap-2.5">
            {onReprint && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTriggerReprint}
                disabled={reprinting}
                className="h-12 px-3.5 text-xs sm:text-sm font-semibold rounded-xl border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 shrink-0"
                title="Reprint Receipt (Press R)"
              >
                <Printer className={`w-4 h-4 text-slate-600 ${reprinting ? "animate-spin" : ""}`} />
                <span>{reprinting ? "Printing…" : "Reprint"}</span>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono">R</span>
              </Button>
            )}
            <Button
              ref={nextButtonRef}
              onClick={onClose}
              className="flex-1 h-12 text-sm sm:text-base font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-md gap-2 transition-all min-w-0"
            >
              <span className="truncate">Next Transaction</span>
              <span className="text-xs bg-emerald-700/60 px-2 py-0.5 rounded font-mono font-normal shrink-0">Enter ↵</span>
              <ArrowRight className="w-4 h-4 ml-0.5 shrink-0" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
