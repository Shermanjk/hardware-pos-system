import { Button } from "@/components/ui/button";
import { Hourglass, PlayCircle, Trash2, X } from "lucide-react";

export interface HeldReturn {
  id: string;
  heldAt: Date;
  returnId: number;
  returnNumber: string;
  invoiceNumber: string;
  customerName: string;
  decision?: "approved" | "rejected" | "waiting_for_cashier" | "completed";
  adminName?: string;
}

interface PendingReturnsPanelProps {
  show: boolean;
  onClose: () => void;
  heldReturns: HeldReturn[];
  onProcess: (hr: HeldReturn) => void;
  onDiscard: (id: string) => void;
}

export default function PendingReturnsPanel({
  show, onClose, heldReturns, onProcess, onDiscard,
}: PendingReturnsPanelProps) {
  return (
    <>
      {show && <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${show ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-gray-300 shrink-0">
          <div className="flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-purple-500" />
            <h2 className="text-base font-bold text-gray-900">Pending Returns</h2>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
              {heldReturns.length}
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {heldReturns.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
              <Hourglass className="h-12 w-12 opacity-20" />
              <p className="text-sm">No pending returns</p>
            </div>
          ) : (
            heldReturns.map((hr) => (
              <div key={hr.id} className={`border rounded-xl p-4 space-y-3 ${
                hr.decision === "waiting_for_cashier" ? "bg-green-50 border-green-200" :
                hr.decision === "completed" ? "bg-blue-50 border-blue-200" :
                hr.decision === "rejected" ? "bg-red-50 border-red-200" :
                "bg-gray-50 border-gray-200"
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 font-mono">{hr.returnNumber}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Invoice: {hr.invoiceNumber}</p>
                    {hr.customerName && <p className="text-xs text-gray-500">Customer: {hr.customerName}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      Parked at {hr.heldAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {hr.decision === "waiting_for_cashier" ? (
                    <span className="shrink-0 text-xs font-semibold text-green-700 bg-green-100 border border-green-300 rounded px-2 py-0.5">✓ Approved</span>
                  ) : hr.decision === "completed" ? (
                    <span className="shrink-0 text-xs font-semibold text-blue-700 bg-blue-100 border border-blue-300 rounded px-2 py-0.5">✓ Completed</span>
                  ) : hr.decision === "rejected" ? (
                    <span className="shrink-0 text-xs font-semibold text-red-700 bg-red-100 border border-red-300 rounded px-2 py-0.5">✗ Rejected</span>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-200 rounded px-2 py-0.5">Awaiting Approval</span>
                  )}
                </div>
                {hr.decision === "rejected" && (
                  <p className="text-xs text-red-600 bg-red-100 rounded px-2 py-1">
                    Rejected by {hr.adminName}. Inform the customer and discard this request.
                  </p>
                )}
                <div className="flex gap-2">
                  {hr.decision === "waiting_for_cashier" && (
                    <Button size="sm" className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5" onClick={() => onProcess(hr)}>
                      <PlayCircle className="h-3.5 w-3.5" />
                      Process Now
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-red-600 border-red-200 hover:bg-red-50 text-xs gap-1.5" onClick={() => onDiscard(hr.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Discard
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
