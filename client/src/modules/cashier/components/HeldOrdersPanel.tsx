import { Button } from "@/components/ui/button";
import { PauseCircle, PlayCircle, Trash2, X } from "lucide-react";
import { toCentavos, fmtCents } from "../utils/money";
import type { CartItem, CustomerInfo } from "../utils/receipt";

export interface HeldOrder {
  id: string;
  heldAt: Date;
  cartItems: CartItem[];
  customerInfo: CustomerInfo;
  label: string;
}

interface HeldOrdersPanelProps {
  show: boolean;
  onClose: () => void;
  heldOrders: HeldOrder[];
  taxRate: number;
  onRecall: (holdId: string) => void;
  onDiscard: (holdId: string) => void;
}

export default function HeldOrdersPanel({
  show, onClose, heldOrders, taxRate, onRecall, onDiscard,
}: HeldOrdersPanelProps) {
  return (
    <>
      {show && <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${show ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-gray-300 shrink-0">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-bold text-gray-900">Held Transactions</h2>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              {heldOrders.length}
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {heldOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
              <PauseCircle className="h-12 w-12 opacity-20" />
              <p className="text-sm">No held transactions</p>
            </div>
          ) : (
            heldOrders.map((hold) => {
              const holdTotal = hold.cartItems.reduce((s, i) => s + toCentavos(i.subtotal), 0);
              const heldTime  = hold.heldAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={hold.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{hold.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Held at {heldTime}</p>
                    </div>
                    <span className="text-sm font-bold text-blue-600 tabular-nums whitespace-nowrap">₱{fmtCents(holdTotal)}</span>
                  </div>
                  <div className="space-y-1">
                    {hold.cartItems.map((item) => (
                      <div key={item.id} className="flex justify-between text-xs text-gray-600">
                        <span className="truncate mr-2">{item.quantity}× {item.name}</span>
                        <span className="tabular-nums shrink-0">₱{fmtCents(toCentavos(item.subtotal))}</span>
                      </div>
                    ))}
                  </div>
                  {hold.customerInfo.name && (
                    <p className="text-xs text-gray-500 border-t border-gray-200 pt-2">
                      Customer: <span className="font-medium text-gray-700">{hold.customerInfo.name}</span>
                      {hold.customerInfo.scPwdType && hold.customerInfo.scPwdType !== "NONE" && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">
                          {hold.customerInfo.scPwdType === "SENIOR_CITIZEN" ? "Senior Citizen" : "PWD"}
                          {hold.customerInfo.scPwdId ? ` · ${hold.customerInfo.scPwdId}` : ""}
                        </span>
                      )}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5" onClick={() => onRecall(hold.id)}>
                      <PlayCircle className="h-3.5 w-3.5" /> Recall
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-red-600 border-red-200 hover:bg-red-50 text-xs gap-1.5" onClick={() => onDiscard(hold.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> Discard
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
