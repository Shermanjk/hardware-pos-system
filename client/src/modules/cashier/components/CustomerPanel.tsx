import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchCustomers, type CustomerSearchResult } from "@/shared/api/customersApi";
import { Building2, CreditCard, Plus, Search, User, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { CustomerInfo } from "../utils/receipt";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

interface CustomerPanelProps {
  customerInfo: CustomerInfo;
  setCustomerInfo: React.Dispatch<React.SetStateAction<CustomerInfo>>;
  /** When true, show SC/PWD identification fields (selected discount is SC/PWD). */
  showScPwdFields?: boolean;
  /** When "CREDIT", show the customer search / credit-mode UI */
  paymentMode?: "CASH" | "CREDIT";
  /** Currently selected credit customer (set by parent) */
  selectedCreditCustomer: CustomerSearchResult | null;
  setSelectedCreditCustomer: (c: CustomerSearchResult | null) => void;
  /** Called when a new customer is created inline during checkout */
  onInlineCustomerCreated?: (c: { id: number; customer_code: string; full_name: string }) => void;
}

export default function CustomerPanel({
  customerInfo, setCustomerInfo,
  showScPwdFields = false,
  paymentMode = "CASH",
  selectedCreditCustomer, setSelectedCreditCustomer,
  onInlineCustomerCreated,
}: CustomerPanelProps) {
  const set = (k: keyof CustomerInfo, v: string) =>
    setCustomerInfo((prev) => ({ ...prev, [k]: v }));

  const setScPwdType = (v: "NONE" | "SENIOR_CITIZEN" | "PWD") =>
    setCustomerInfo((prev) => ({ ...prev, scPwdType: v }));

  // ── Credit customer search state ──────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    setSearchLoading(true);
    try {
      const results = await searchCustomers(q);
      setSearchResults(results);
      setShowDropdown(results.length > 0 || q.length > 0);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paymentMode !== "CREDIT") return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => doSearch(searchQuery), 280);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [searchQuery, paymentMode, doSearch]);

  // When payment mode changes back to CASH, clear credit customer
  useEffect(() => {
    if (paymentMode === "CASH") {
      setSelectedCreditCustomer(null);
      setSearchQuery("");
      setSearchResults([]);
      setShowDropdown(false);
    }
  }, [paymentMode, setSelectedCreditCustomer]);

  // Real-time zero-refresh sync: refresh selected customer data if their balance or credit limit was modified
  useRealtimeSync(["customers", "credit_ledger"], async (event) => {
    if (selectedCreditCustomer && (!event.customerId || event.customerId === selectedCreditCustomer.id)) {
      try {
        const { getCustomer } = await import("@/shared/api/customersApi");
        const updated = await getCustomer(selectedCreditCustomer.id);
        if (updated) {
          setSelectedCreditCustomer({
            ...selectedCreditCustomer,
            current_balance: Number(updated.current_balance),
            credit_limit: Number(updated.credit_limit),
            is_credit_enabled: Boolean(updated.is_credit_enabled),
          });
        }
      } catch {
        /* silent */
      }
    }
  });

  async function handleCreateInline() {
    if (!newCustomerName.trim()) { toast.warning("Customer name is required."); return; }
    setIsCreating(true);
    try {
      const { createCustomer } = await import("@/shared/api/customersApi");
      const result = await createCustomer({
        full_name: newCustomerName.trim(),
        contact_number: newCustomerContact.trim() || undefined,
        address: newCustomerAddress.trim() || undefined,
      });
      onInlineCustomerCreated?.(result);
      toast.success(`Customer "${result.full_name}" created. Note: An admin must enable credit before this customer can use it.`);
      setShowCreateForm(false);
      setNewCustomerName(""); setNewCustomerContact(""); setNewCustomerAddress("");
      // Search for the new customer to select them
      const results = await searchCustomers(result.full_name);
      const newCust = results.find((r) => r.id === result.id);
      if (newCust) {
        setSelectedCreditCustomer(newCust);
        setCustomerInfo((prev) => ({ ...prev, name: newCust.full_name, address: newCust.address ?? "" }));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to create customer.");
    } finally {
      setIsCreating(false);
    }
  }

  const selectCustomer = (c: CustomerSearchResult) => {
    setSelectedCreditCustomer(c);
    setCustomerInfo((prev) => ({
      ...prev,
      name: c.full_name,
      address: c.address ?? "",
    }));
    setSearchQuery(c.full_name);
    setShowDropdown(false);
  };

  const clearCreditCustomer = () => {
    setSelectedCreditCustomer(null);
    setSearchQuery("");
    setCustomerInfo((prev) => ({ ...prev, name: "" }));
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // ── Balance indicator color ───────────────────────────────────────────────
  const getBalanceStatus = (customer: CustomerSearchResult) => {
    if (!customer.is_credit_enabled) return "disabled";
    if (customer.credit_limit === 0) return "no-limit";
    const ratio = customer.current_balance / customer.credit_limit;
    if (ratio >= 1) return "over";
    if (ratio >= 0.8) return "warning";
    return "ok";
  };

  const fmt = (n: number) => "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── CREDIT MODE UI ────────────────────────────────────────────────────────
  if (paymentMode === "CREDIT") {
    return (
      <div className="w-72 shrink-0 flex flex-col min-h-0">
        <div className="flex-1 bg-blue-50 rounded-xl border-2 border-blue-400 shadow-sm px-4 py-3 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-4 w-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">Credit / Utang Customer</h3>
          </div>

          {/* Selected customer display */}
          {selectedCreditCustomer ? (
            <div className="space-y-3">
              <div className="bg-white rounded-xl border-2 border-blue-300 p-3 relative">
                <button
                  onClick={clearCreditCustomer}
                  className="absolute top-2 right-2 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-sm leading-tight truncate">{selectedCreditCustomer.full_name}</p>
                    <p className="text-xs text-slate-400">{selectedCreditCustomer.customer_code}</p>
                  </div>
                </div>

                {selectedCreditCustomer.is_credit_enabled ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Credit Limit</span>
                      <span className="font-semibold text-slate-700">{fmt(selectedCreditCustomer.credit_limit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current Balance</span>
                      <span className={`font-bold ${
                        getBalanceStatus(selectedCreditCustomer) === "over" ? "text-red-600" :
                        getBalanceStatus(selectedCreditCustomer) === "warning" ? "text-amber-600" :
                        "text-emerald-600"
                      }`}>{fmt(selectedCreditCustomer.current_balance)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Available</span>
                      <span className={`font-semibold ${
                        selectedCreditCustomer.credit_limit - selectedCreditCustomer.current_balance <= 0
                          ? "text-red-600" : "text-blue-600"
                      }`}>
                        {fmt(Math.max(0, selectedCreditCustomer.credit_limit - selectedCreditCustomer.current_balance))}
                      </span>
                    </div>
                    {/* Balance bar */}
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full rounded-full transition-all ${
                          getBalanceStatus(selectedCreditCustomer) === "over" ? "bg-red-500" :
                          getBalanceStatus(selectedCreditCustomer) === "warning" ? "bg-amber-500" :
                          "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, (selectedCreditCustomer.current_balance / selectedCreditCustomer.credit_limit) * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 text-center">
                    ⚠️ Credit not enabled for this customer.
                    <br />Admin must enable credit in Customer Management.
                  </div>
                )}
              </div>

              {selectedCreditCustomer.contact_number && (
                <p className="text-xs text-slate-500 text-center">📞 {selectedCreditCustomer.contact_number}</p>
              )}
            </div>
          ) : !showCreateForm ? (
            <div className="space-y-3 flex-1">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  ref={searchRef}
                  id="credit-customer-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search customer name…"
                  className="w-full pl-9 pr-3 h-10 rounded-lg border-2 border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {/* Dropdown */}
              {showDropdown && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-y-auto max-h-48">
                  {searchResults.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-slate-500 text-center">No customers found</div>
                  ) : (
                    searchResults.map((c) => {
                      const status = getBalanceStatus(c);
                      return (
                        <button
                          key={c.id}
                          onClick={() => selectCustomer(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-0 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{c.full_name}</p>
                              <p className="text-xs text-slate-400">{c.customer_code}</p>
                            </div>
                            <div className={`shrink-0 w-2 h-2 rounded-full ${
                              !c.is_credit_enabled ? "bg-slate-300" :
                              status === "over" ? "bg-red-500" :
                              status === "warning" ? "bg-amber-400" :
                              "bg-emerald-500"
                            }`} title={
                              !c.is_credit_enabled ? "Credit not enabled" :
                              status === "over" ? "Over limit" :
                              status === "warning" ? "Near limit" : "OK"
                            } />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-blue-700 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Create New Customer
              </button>

              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                Select a registered customer with credit enabled to proceed with a credit sale.
              </p>
            </div>
          ) : (
            /* Inline Create Form */
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-700">New Customer</p>
              <Input
                placeholder="Full name *"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="h-9 text-sm"
              />
              <Input
                placeholder="Contact number"
                value={newCustomerContact}
                onChange={(e) => setNewCustomerContact(e.target.value)}
                className="h-9 text-sm"
              />
              <Input
                placeholder="Address"
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
                className="h-9 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                  onClick={handleCreateInline}
                  disabled={isCreating || !newCustomerName.trim()}
                >
                  {isCreating ? "Creating…" : "Create"}
                </Button>
                <Button variant="outline" className="h-9 px-3" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
              </div>
              <p className="text-[10px] text-amber-600 text-center">
                Admin must enable credit separately after creation.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── CASH MODE UI (original layout, unchanged) ─────────────────────────────
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
                <select
                  id="customer-type-select-trigger"
                  value={customerInfo.scPwdType && customerInfo.scPwdType !== "NONE" ? customerInfo.scPwdType : ""}
                  onChange={(e) => setScPwdType(e.target.value as "NONE" | "SENIOR_CITIZEN" | "PWD")}
                  className="w-full h-10 rounded-md border border-slate-400 bg-white text-sm text-slate-900 px-3 focus:outline-none focus:border-blue-500"
                >
                  <option value="" disabled>Select customer type</option>
                  <option value="SENIOR_CITIZEN">Senior Citizen</option>
                  <option value="PWD">PWD</option>
                </select>
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