import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomer, searchCustomers, type CustomerSearchResult } from "@/shared/api/customersApi";
import { Building2, CreditCard, HandCoins, Plus, Search, User, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { CustomerInfo } from "../utils/receipt";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

interface CustomerPanelProps {
  customerInfo: CustomerInfo;
  setCustomerInfo: React.Dispatch<React.SetStateAction<CustomerInfo>>;
  /** When true, show SC/PWD identification fields (selected discount is SC/PWD). */
  showScPwdFields?: boolean;
  /** When "CREDIT" or "COLLECT_UTANG", show the customer search / credit-mode UI */
  paymentMode?: "CASH" | "CREDIT" | "COLLECT_UTANG";
  /** Currently selected credit customer (set by parent) */
  selectedCreditCustomer: CustomerSearchResult | null;
  setSelectedCreditCustomer: (c: CustomerSearchResult | null) => void;
  /** Called when a new customer is created inline during checkout */
  onInlineCustomerCreated?: (c: { id: number; customer_code: string; full_name: string }) => void;
  /** Called to switch to Collect Utang mode / open payment for this customer */
  onCollectPayment?: (c: CustomerSearchResult) => void;
}

export default function CustomerPanel({
  customerInfo, setCustomerInfo,
  showScPwdFields = false,
  paymentMode = "CASH",
  selectedCreditCustomer, setSelectedCreditCustomer,
  onInlineCustomerCreated,
  onCollectPayment,
}: CustomerPanelProps) {
  const set = (k: keyof CustomerInfo, v: string) =>
    setCustomerInfo((prev) => ({ ...prev, [k]: v }));

  const setScPwdType = (v: "NONE" | "SENIOR_CITIZEN" | "PWD") =>
    setCustomerInfo((prev) => ({ ...prev, scPwdType: v }));

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form fields for inline creation
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync selected credit customer info to parent customerInfo
  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCreditCustomer(customer);
    setCustomerInfo({
      name: customer.full_name,
      address: customer.address || "",
      tin: "",
      businessStyle: "",
      scPwdType: "NONE",
      scPwdId: "",
    });
    setSearchQuery("");
    setShowDropdown(false);
  };

  const selectCustomer = handleSelectCustomer;

  const clearCreditCustomer = () => {
    setSelectedCreditCustomer(null);
    setCustomerInfo({ name: "", address: "", tin: "", businessStyle: "", scPwdType: "NONE", scPwdId: "" });
    setSearchQuery("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  // Debounced search
  useEffect(() => {
    if (paymentMode !== "CREDIT" && paymentMode !== "COLLECT_UTANG") return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchCustomers(searchQuery.trim());
        setSearchResults(results);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery, paymentMode]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const handleCreateInline = async () => {
    if (!newCustomerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setIsCreating(true);
    try {
      const created = await createCustomer({
        full_name: newCustomerName.trim(),
        contact_number: newCustomerContact.trim() || undefined,
        address: newCustomerAddress.trim() || undefined,
      });
      toast.success(`Customer ${created.customer_code} created! (Credit is disabled by default)`);
      const searchRes: CustomerSearchResult = {
        id: created.id,
        customer_code: created.customer_code,
        full_name: created.full_name,
        contact_number: newCustomerContact.trim() || undefined,
        address: newCustomerAddress.trim() || undefined,
        is_credit_enabled: false,
        credit_limit: 0,
        current_balance: 0,
        status: "Active",
      };
      setShowCreateForm(false);
      setNewCustomerName("");
      setNewCustomerContact("");
      setNewCustomerAddress("");
      handleSelectCustomer(searchRes);
      onInlineCustomerCreated?.({ id: created.id, customer_code: created.customer_code, full_name: created.full_name });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create customer";
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
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

  // ── CREDIT / COLLECT UTANG MODE UI ────────────────────────────────────────
  if (paymentMode === "CREDIT" || paymentMode === "COLLECT_UTANG") {
    return (
      <div className="w-72 shrink-0 flex flex-col min-h-0">
        <div className="flex-1 bg-blue-50 rounded-xl border-2 border-blue-400 shadow-sm px-4 py-3 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            {paymentMode === "COLLECT_UTANG" ? (
              <HandCoins className="h-4 w-4 text-blue-600" />
            ) : (
              <CreditCard className="h-4 w-4 text-blue-600" />
            )}
            <h3 className="text-sm font-bold text-slate-900">
              {paymentMode === "COLLECT_UTANG" ? "Customer (Pay Utang)" : "Credit / Utang Customer"}
            </h3>
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

                {Number(selectedCreditCustomer.current_balance ?? 0) > 0 && onCollectPayment && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onCollectPayment(selectedCreditCustomer)}
                    className="w-full mt-2.5 h-8 text-xs font-bold text-blue-700 bg-blue-50/90 border-blue-300 hover:bg-blue-100 hover:text-blue-800 gap-1.5 shadow-xs"
                  >
                    <HandCoins className="w-3.5 h-3.5" />
                    <span>Pay Utang / Settle Balance</span>
                  </Button>
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