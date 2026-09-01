import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Monitor, CheckCircle2, AlertCircle, RefreshCw, Laptop } from "lucide-react";
import type { POSTerminal } from "@/shared/api/terminalsApi";

interface TerminalBindingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terminals: POSTerminal[];
  currentTerminalId: number | null;
  onSelectTerminal: (id: number | null) => void;
  onRefresh?: () => void;
}

export function TerminalBindingModal({
  open,
  onOpenChange,
  terminals,
  currentTerminalId,
  onSelectTerminal,
  onRefresh,
}: TerminalBindingModalProps) {
  const [selectedId, setSelectedId] = useState<number | null>(currentTerminalId);

  // Sync selectedId when modal opens
  React.useEffect(() => {
    if (open) {
      setSelectedId(currentTerminalId);
    }
  }, [open, currentTerminalId]);

  const handleSave = () => {
    onSelectTerminal(selectedId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
              <Laptop className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-gray-900">
                Select Workstation / Counter
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500">
                Assign this computer to a registered checkout counter.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-800 leading-relaxed">
            💡 <strong>One-time local setup:</strong> Receipts printed from this computer will automatically carry the selected counter's <strong>Terminal Number</strong>, <strong>Machine Identification (MIN)</strong>, and <strong>Hardware S/N</strong>.
          </div>

          {terminals.length === 0 ? (
            <div className="p-6 text-center text-gray-500 border border-dashed rounded-lg">
              <AlertCircle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
              <p className="text-sm font-semibold text-gray-700">No Terminals Registered</p>
              <p className="text-xs text-gray-500 mt-1">
                Ask an Admin to configure POS terminals in <strong>Admin &gt; Settings &gt; Business</strong>.
              </p>
              {onRefresh && (
                <Button variant="outline" size="sm" onClick={onRefresh} className="mt-3 text-xs gap-1.5">
                  <RefreshCw className="h-3 w-3" /> Refresh Terminals
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {terminals.map((t) => {
                const isSelected = selectedId === t.id;
                const isCurrent = currentTerminalId === t.id;

                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`p-3.5 rounded-lg border-2 cursor-pointer transition-all flex items-start justify-between ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/60 shadow-xs"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? "border-blue-600 bg-blue-600" : "border-gray-300 bg-white"
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900">{t.terminal_name}</span>
                          <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                            {t.terminal_code}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5 text-xs text-gray-500 font-mono">
                          <div>S/N: <strong className="text-gray-700">{t.pos_serial || "Not Set"}</strong></div>
                          <div>MIN: <strong className="text-gray-700">{t.pos_min || "Not Set"}</strong></div>
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="mt-5 flex items-center justify-between sm:justify-between">
          {currentTerminalId !== null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onSelectTerminal(null);
                onOpenChange(false);
              }}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Unbind Station
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selectedId === null}
              onClick={handleSave}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
            >
              Save Selection
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
