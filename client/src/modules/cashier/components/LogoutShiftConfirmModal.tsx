import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Clock, Coffee, LogOut, PowerOff, ShieldAlert } from "lucide-react";

interface LogoutShiftConfirmModalProps {
  open: boolean;
  onClose: () => void;
  /** Called when the cashier chooses to end their shift and count cash */
  onEndShift: () => void;
  /** Called when the cashier confirms a temporary logout (keeping shift active) */
  onTemporaryLogout: () => void;
  /** Optional shift label for display (e.g. "Day Shift") */
  shiftLabel?: string;
  /** Optional shift start time */
  openedAt?: string | null;
}

export default function LogoutShiftConfirmModal({
  open,
  onClose,
  onEndShift,
  onTemporaryLogout,
  shiftLabel = "Active Shift",
  openedAt,
}: LogoutShiftConfirmModalProps) {
  const formattedOpenedAt = openedAt
    ? new Date(openedAt).toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden border-0 shadow-2xl">
        <DialogTitle className="sr-only">Active Shift Logout Confirmation</DialogTitle>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-amber-600 px-6 py-4 text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold leading-tight">Active Shift Detected</h2>
            <p className="text-xs text-amber-100 mt-0.5">
              You are currently logged into an active shift
            </p>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="p-6 space-y-5 bg-white">
          {/* Shift info badge */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-amber-900 font-semibold">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{shiftLabel}</span>
            </div>
            {formattedOpenedAt && (
              <div className="flex items-center gap-1 text-amber-700">
                <Clock className="h-3.5 w-3.5" />
                <span>Opened at {formattedOpenedAt}</span>
              </div>
            )}
          </div>

          <p className="text-sm text-gray-600 leading-relaxed">
            Before logging out, please specify if you are finishing your shift for the day or just stepping away temporarily:
          </p>

          {/* Action Options */}
          <div className="space-y-3">
            {/* Option 1: End Shift & Submit Cash Count */}
            <button
              type="button"
              onClick={onEndShift}
              className="w-full text-left p-3.5 rounded-xl border-2 border-red-200 bg-red-50/70 hover:bg-red-100/90 hover:border-red-400 transition-all group flex items-start gap-3.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm group-hover:scale-105 transition-transform">
                <PowerOff className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-red-900 text-sm">
                    End Shift & Count Drawer
                  </span>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-red-200/80 text-red-800">
                    Recommended at End of Day
                  </span>
                </div>
                <p className="text-xs text-red-700 mt-1 leading-snug">
                  Count physical cash in the drawer, generate the reconciliation summary, and log out.
                </p>
              </div>
            </button>

            {/* Option 2: Temporary Logout (Break / Lunch) */}
            <button
              type="button"
              onClick={onTemporaryLogout}
              className="w-full text-left p-3.5 rounded-xl border-2 border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all group flex items-start gap-3.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm group-hover:scale-105 transition-transform">
                <Coffee className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">
                    Temporary Logout (Keep Shift Active)
                  </span>
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    Break / Lunch
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-snug">
                  Log out now without closing the shift. Your drawer and shift stay open when you log back in.
                </p>
              </div>
            </button>
          </div>

          {/* Cancel button */}
          <div className="pt-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-xs font-semibold h-9"
              onClick={onClose}
            >
              Stay on POS Terminal (Cancel)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
