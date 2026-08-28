import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Clock,
  Layers,
  PauseCircle,
  PowerOff,
  ShieldAlert,
  ShoppingCart,
  User,
  Wrench,
} from "lucide-react";
import type { ActiveWorkDetails } from "../hooks/usePreventAccidentalClose";
import { useEffect, useRef } from "react";

export type TerminalType = "CASHIER" | "ADMIN" | "CLERK";

interface PreventCloseModalProps {
  open: boolean;
  onClose: () => void;
  hasActiveWork: boolean;
  terminalType?: TerminalType;
  portalName?: string;
  workDetails?: ActiveWorkDetails;
  onHoldAndExit?: () => Promise<void> | void;
  onForceExit: () => void;
  onEndShift?: () => void;
}

export default function PreventCloseModal({
  open,
  onClose,
  hasActiveWork,
  terminalType = "CASHIER",
  portalName,
  workDetails,
  onHoldAndExit,
  onForceExit,
  onEndShift,
}: PreventCloseModalProps) {
  const resumeButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the primary "Resume / Stay" button whenever the modal opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        resumeButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const itemsCount = workDetails?.itemsCount ?? 0;
  const totalAmount = workDetails?.totalAmount;
  const customerName = workDetails?.customerName;
  const shiftActive = workDetails?.shiftActive ?? false;
  const shiftLabel = workDetails?.shiftLabel ?? "Active Shift";

  const defaultPortalName =
    portalName ||
    (terminalType === "ADMIN"
      ? "Admin Terminal"
      : terminalType === "CLERK"
      ? "Inventory Clerk Terminal"
      : "POS Kiosk Terminal");

  const defaultStayText =
    terminalType === "ADMIN"
      ? "Stay in Admin Terminal"
      : terminalType === "CLERK"
      ? "Stay in Clerk Terminal"
      : hasActiveWork
      ? "Stay on POS (Resume Sale)"
      : "Stay on POS";

  const defaultExitText =
    terminalType === "ADMIN"
      ? "Exit Admin Terminal"
      : terminalType === "CLERK"
      ? "Exit Clerk Terminal"
      : "Exit Kiosk Window";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden border-0 shadow-2xl rounded-2xl">
        <DialogTitle className="sr-only">
          {hasActiveWork ? "Attention: Active Work in Progress" : `Exit ${defaultPortalName}`}
        </DialogTitle>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        {hasActiveWork ? (
          <div className="bg-gradient-to-r from-red-600 to-amber-600 px-6 py-5 text-white flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                <ShieldAlert className="h-6 w-6 text-white animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/25 text-white tracking-wide">
                    Attention: Unsaved Work Detected
                  </span>
                </div>
                <h2 className="text-lg font-bold leading-tight mt-0.5 text-white">
                  {workDetails?.title || "Active Work in Progress!"}
                </h2>
                <p className="text-xs text-amber-100 font-medium">
                  Leaving or closing now may discard unsaved changes or active progress.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5 text-white flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                {terminalType === "ADMIN" ? (
                  <Wrench className="h-6 w-6 text-blue-400" />
                ) : terminalType === "CLERK" ? (
                  <Boxes className="h-6 w-6 text-emerald-400" />
                ) : (
                  <PowerOff className="h-6 w-6 text-blue-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/20 text-slate-200 tracking-wide">
                    Confirmation Required
                  </span>
                </div>
                <h2 className="text-lg font-bold leading-tight mt-0.5 text-white">
                  Are You Sure You Want to Exit?
                </h2>
                <p className="text-xs text-slate-300 font-medium">
                  Please confirm if you want to leave {defaultPortalName}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="p-6 space-y-5 bg-white">
          {hasActiveWork ? (
            <>
              {/* Active Work Details Card */}
              <div className="bg-amber-50/80 border-2 border-amber-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    Current Status & Details
                  </span>
                  {shiftActive && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {shiftLabel}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {itemsCount > 0 && (
                    <div className="bg-white rounded-lg p-2.5 border border-amber-100 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium">
                        {terminalType === "CLERK" ? (
                          <Layers className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <ShoppingCart className="h-3.5 w-3.5 text-amber-600" />
                        )}
                        <span>{terminalType === "CLERK" ? "Staged Items" : "Cart Items"}</span>
                      </div>
                      <p className="text-base font-bold text-gray-900 mt-0.5">
                        {itemsCount} item{itemsCount > 1 ? "s" : ""}
                      </p>
                    </div>
                  )}

                  {totalAmount !== undefined && (
                    <div className="bg-white rounded-lg p-2.5 border border-amber-100 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium">
                        <span>Total Amount</span>
                      </div>
                      <p className="text-base font-bold text-blue-700 font-mono mt-0.5">
                        {typeof totalAmount === "number" ? `₱${totalAmount.toFixed(2)}` : totalAmount}
                      </p>
                    </div>
                  )}

                  {customerName && (
                    <div className="col-span-2 bg-white rounded-lg p-2.5 border border-amber-100 shadow-2xs flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-gray-500 text-xs font-medium">
                        <User className="h-3.5 w-3.5 text-amber-600" />
                        <span>Customer</span>
                      </div>
                      <span className="font-semibold text-gray-900 text-xs">
                        {customerName}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-amber-800 leading-relaxed">
                  {workDetails?.description ||
                    "Please ensure all your active work and records are saved or completed before exiting to prevent any loss of data."}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5">
                {/* 1. Primary Safe Action: Stay / Resume */}
                <Button
                  ref={resumeButtonRef}
                  type="button"
                  size="lg"
                  onClick={onClose}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all gap-2 flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>{defaultStayText}</span>
                  <span className="text-[10px] bg-blue-700/80 px-2 py-0.5 rounded font-mono text-blue-100 ml-auto">
                    Esc / Enter
                  </span>
                </Button>

                {/* 2. Hold Transaction before exit (if cart has items in cashier) */}
                {onHoldAndExit && itemsCount > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={onHoldAndExit}
                    className="w-full h-11 bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs gap-2 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <PauseCircle className="h-4 w-4 text-amber-600" />
                      <span>Hold & Suspend Order (Save to DB)</span>
                    </div>
                    <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-mono font-bold">
                      F5 Hold
                    </span>
                  </Button>
                )}

                {/* 3. End Shift & Exit option if shift is open */}
                {shiftActive && onEndShift && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={onEndShift}
                    className="w-full h-11 bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300 font-semibold text-xs gap-2 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <PowerOff className="h-4 w-4 text-red-600" />
                      <span>End Shift & Count Drawer</span>
                    </div>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                      Shift Summary
                    </span>
                  </Button>
                )}

                {/* 4. Force Discard & Exit */}
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    Discard unsaved changes and exit?
                  </span>
                  <button
                    type="button"
                    onClick={onForceExit}
                    className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline cursor-pointer"
                  >
                    Discard & Exit
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Idle State Confirmation */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-sm text-slate-700 leading-relaxed">
                  Are you sure you want to exit {defaultPortalName}?
                </p>

                {shiftActive && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5 text-xs text-amber-900">
                    <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Active Shift is Open</p>
                      <p className="text-amber-700 text-[11px] mt-0.5">
                        Your drawer session ({shiftLabel}) is currently active. If you are leaving for the day, please End Shift to balance your cash count.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions for Idle State */}
              <div className="space-y-2.5">
                <Button
                  ref={resumeButtonRef}
                  type="button"
                  size="lg"
                  onClick={onClose}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2 flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>{defaultStayText}</span>
                  <span className="text-[10px] bg-blue-700/80 px-2 py-0.5 rounded font-mono text-blue-100 ml-auto">
                    Esc / Enter
                  </span>
                </Button>

                {shiftActive && onEndShift && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={onEndShift}
                    className="w-full h-11 bg-red-50 hover:bg-red-100 text-red-900 border-red-200 font-semibold text-xs gap-2 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <PowerOff className="h-4 w-4 text-red-600" />
                      <span>End Shift & Exit</span>
                    </div>
                    <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded font-mono">
                      Count Cash
                    </span>
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onForceExit}
                  className="w-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-semibold h-9 cursor-pointer"
                >
                  {defaultExitText}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
