import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Zap } from "lucide-react";
import type { CustomerInfo } from "../utils/receipt";

interface CustomerPanelProps {
  customerInfo: CustomerInfo;
  setCustomerInfo: React.Dispatch<React.SetStateAction<CustomerInfo>>;
  /** When true, show SC/PWD identification fields (selected discount is SC/PWD). */
  showScPwdFields?: boolean;
}

export default function CustomerPanel({ customerInfo, setCustomerInfo, showScPwdFields = false }: CustomerPanelProps) {
  const set = (k: keyof CustomerInfo, v: string) =>
    setCustomerInfo((prev) => ({ ...prev, [k]: v }));

  const setScPwdType = (v: "NONE" | "SENIOR_CITIZEN" | "PWD") =>
    setCustomerInfo((prev) => ({ ...prev, scPwdType: v }));

  return (
    <div className="w-72 shrink-0 flex flex-col min-h-0">
      <div className="flex-1 bg-slate-50 rounded-xl border-2 border-slate-400 shadow-sm px-4 py-3 flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Customer Details</h3>
          {(customerInfo.name || customerInfo.tin || customerInfo.scPwdId) && (
            <button
              onClick={() => setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "", scPwdType: "NONE", scPwdId: "" })}
              className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {/* 1-Click Walk-In Customer preset button */}
        {!showScPwdFields && (
          <button
            type="button"
            onClick={() => {
              set("name", "Walk-in Customer");
              document.getElementById("cash-tendered-input")?.focus();
            }}
            className="mb-3 w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold bg-blue-50/80 hover:bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-between gap-1.5 transition-all active:scale-[0.98] shadow-xs"
          >
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-blue-600 fill-blue-600/30" />
              <span>Walk-In Customer</span>
            </div>
            <span className="font-mono text-[10px] bg-blue-200/70 text-blue-800 px-1 py-0.5 rounded font-medium">
              F3 / Alt+W
            </span>
          </button>
        )}

        {/* Contextual SC/PWD Banner */}
        {showScPwdFields && (
          <div className="mb-3 p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-start gap-2">
            <span className="shrink-0 text-sm">🏷️</span>
            <div>
              <p className="font-bold text-purple-950">SC/PWD Exemption Active</p>
              <p className="text-[11px] text-purple-700 leading-tight mt-0.5">Please verify and record the customer's OSCA / PWD ID number.</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">Sold To <span className="text-red-500">*</span></label>
            <Input
              id="customer-name-input"
              value={customerInfo.name}
              onChange={(e) => set("name", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (showScPwdFields) {
                    document.getElementById("customer-osca-id-input")?.focus();
                  } else {
                    document.getElementById("customer-address-input")?.focus();
                  }
                }
              }}
              placeholder="Name or company"
              className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Customer Type Selector & ID — shown dynamically when an SC/PWD statutory discount is selected */}
          {showScPwdFields && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Customer Type <span className="text-red-500">*</span>
                </label>
                <Select
                  value={customerInfo.scPwdType && customerInfo.scPwdType !== "NONE" ? customerInfo.scPwdType : ""}
                  onValueChange={(v) => setScPwdType(v as "NONE" | "SENIOR_CITIZEN" | "PWD")}
                >
                  <SelectTrigger id="customer-type-select-trigger" className="h-10 text-sm bg-white border-slate-400 text-slate-900">
                    <SelectValue placeholder="Select customer type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SENIOR_CITIZEN">Senior Citizen</SelectItem>
                    <SelectItem value="PWD">PWD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  {customerInfo.scPwdType === "PWD" ? "PWD ID Number" : "OSCA / Senior Citizen ID Number"} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="customer-osca-id-input"
                  value={customerInfo.scPwdId || ""}
                  onChange={(e) => set("scPwdId", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      document.getElementById("customer-address-input")?.focus();
                    }
                  }}
                  placeholder={customerInfo.scPwdType === "PWD" ? "Enter PWD ID number" : "Enter OSCA / SC ID number"}
                  className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">Address</label>
            <Input
              id="customer-address-input"
              value={customerInfo.address}
              onChange={(e) => set("address", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("customer-tin-input")?.focus();
                }
              }}
              placeholder="Street, City, Province"
              className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">TIN</label>
            <Input
              id="customer-tin-input"
              value={customerInfo.tin}
              onChange={(e) => set("tin", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("customer-business-style-input")?.focus();
                }
              }}
              placeholder="000-000-000-000"
              className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">Business Style</label>
            <Input
              id="customer-business-style-input"
              value={customerInfo.businessStyle}
              onChange={(e) => set("businessStyle", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("cash-tendered-input")?.focus();
                }
              }}
              placeholder="e.g. Trading"
              className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>
    </div>
  );
}