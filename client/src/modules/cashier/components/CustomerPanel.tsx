import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User } from "lucide-react";
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
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Customer Details</h3>
          {(customerInfo.name || customerInfo.tin || customerInfo.scPwdId) && (
            <button
              onClick={() => setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "", scPwdType: "NONE", scPwdId: "" })}
              className="ml-auto text-xs text-red-400 hover:text-red-600"
            >
              Clear
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">Sold To <span className="text-red-500">*</span></label>
            <Input
              value={customerInfo.name}
              onChange={(e) => set("name", e.target.value)}
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
                  <SelectTrigger className="h-10 text-sm bg-white border-slate-400 text-slate-900">
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
                  value={customerInfo.scPwdId || ""}
                  onChange={(e) => set("scPwdId", e.target.value)}
                  placeholder={customerInfo.scPwdType === "PWD" ? "Enter PWD ID number" : "Enter OSCA / SC ID number"}
                  className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">Address</label>
            <Input
              value={customerInfo.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Street, City, Province"
              className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">TIN</label>
            <Input
              value={customerInfo.tin}
              onChange={(e) => set("tin", e.target.value)}
              placeholder="000-000-000-000"
              className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1">Business Style</label>
            <Input
              value={customerInfo.businessStyle}
              onChange={(e) => set("businessStyle", e.target.value)}
              placeholder="e.g. Trading"
              className="h-10 text-sm bg-white border-slate-400 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>
    </div>
  );
}