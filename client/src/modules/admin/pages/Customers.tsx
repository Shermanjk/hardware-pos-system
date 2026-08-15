import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  createCustomer,
  getCustomers,
  recordCreditPayment,
  updateCreditSettings,
  updateCustomer,
  type Customer,
} from "@/shared/api/customersApi";
import { getSettings, type StoreSettings } from "@/shared/api/settingsApi";
import { printCreditPaymentReceipt } from "@/modules/cashier/utils/receipt";
import { useAuth } from "@/shared/contexts/AuthContext";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CreditCard,
  Edit2,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Sliders,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import PesoSign from "@/shared/components/PesoSign";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

const fmt = (n: number) =>
  "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CustomersPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "with_balance" | "credit_enabled">("all");
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // ── Modals state ────────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [creditSettingsCustomer, setCreditSettingsCustomer] = useState<Customer | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);

  // Form states
  const [addForm, setAddForm] = useState({
    full_name: "",
    contact_number: "",
    address: "",
    tin: "",
    business_style: "",
    is_credit_enabled: false,
    credit_limit: "0",
  });
  const [editForm, setEditForm] = useState({
    full_name: "",
    contact_number: "",
    address: "",
    tin: "",
    business_style: "",
    status: "Active" as "Active" | "Inactive",
  });
  const [creditForm, setCreditForm] = useState({
    is_credit_enabled: false,
    credit_limit: "0",
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    notes: "",
    autoPrintReceipt: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [data, settings] = await Promise.all([
        getCustomers(),
        getSettings().catch(() => null),
      ]);
      setCustomers(Array.isArray(data) ? data : []);
      if (settings) setStoreSettings(settings);
    } catch (err) {
      console.error("Failed to load customers:", err);
      toast.error("Failed to load customers.");
      setCustomers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time zero-refresh sync: auto-refreshes when customers, payments, or sales update
  useRealtimeSync(["customers", "credit_ledger", "sales"], loadData);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // ── Safe customer array ─────────────────────────────────────────────────────
  const safeCustomers = useMemo(() => (Array.isArray(customers) ? customers : []), [customers]);

  // ── KPI calculations ────────────────────────────────────────────────────────
  const totalReceivables = useMemo(
    () => safeCustomers.reduce((sum, c) => sum + (c.status === "Active" ? (Number(c.current_balance) || 0) : 0), 0),
    [safeCustomers]
  );
  const customersWithBalance = useMemo(
    () => safeCustomers.filter((c) => (Number(c.current_balance) || 0) > 0).length,
    [safeCustomers]
  );
  const creditEnabledCount = useMemo(
    () => safeCustomers.filter((c) => !!c.is_credit_enabled).length,
    [safeCustomers]
  );

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    return safeCustomers.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (c.full_name && c.full_name.toLowerCase().includes(q)) ||
        (c.customer_code && c.customer_code.toLowerCase().includes(q)) ||
        (c.contact_number && c.contact_number.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (statusFilter === "active") return c.status === "Active";
      if (statusFilter === "with_balance") return (Number(c.current_balance) || 0) > 0;
      if (statusFilter === "credit_enabled") return !!c.is_credit_enabled;
      return true;
    });
  }, [safeCustomers, searchQuery, statusFilter]);

  // ── Add Customer ────────────────────────────────────────────────────────────
  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.full_name.trim()) {
      toast.warning("Customer full name is required.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await createCustomer({
        full_name: addForm.full_name.trim(),
        contact_number: addForm.contact_number.trim() || undefined,
        address: addForm.address.trim() || undefined,
        tin: addForm.tin.trim() || undefined,
        business_style: addForm.business_style.trim() || undefined,
      });

      // If credit settings were configured, update them
      if (addForm.is_credit_enabled || Number(addForm.credit_limit) > 0) {
        await updateCreditSettings(res.id, {
          is_credit_enabled: addForm.is_credit_enabled,
          credit_limit: Math.max(0, Number(addForm.credit_limit) || 0),
        });
      }

      toast.success(`Customer "${res.full_name}" created (${res.customer_code}).`);
      setShowAddModal(false);
      setAddForm({
        full_name: "",
        contact_number: "",
        address: "",
        tin: "",
        business_style: "",
        is_credit_enabled: false,
        credit_limit: "0",
      });
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to create customer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Edit Info ───────────────────────────────────────────────────────────────
  function openEditModal(c: Customer) {
    setEditCustomer(c);
    setEditForm({
      full_name: c.full_name,
      contact_number: c.contact_number || "",
      address: c.address || "",
      tin: c.tin || "",
      business_style: c.business_style || "",
      status: c.status,
    });
  }

  async function handleUpdateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!editCustomer) return;
    setIsSubmitting(true);
    try {
      await updateCustomer(editCustomer.id, {
        full_name: editForm.full_name.trim(),
        contact_number: editForm.contact_number.trim() || undefined,
        address: editForm.address.trim() || undefined,
        tin: editForm.tin.trim() || undefined,
        business_style: editForm.business_style.trim() || undefined,
        status: editForm.status,
      });
      toast.success("Customer information updated.");
      setEditCustomer(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update customer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Credit Settings ─────────────────────────────────────────────────────────
  function openCreditSettingsModal(c: Customer) {
    setCreditSettingsCustomer(c);
    setCreditForm({
      is_credit_enabled: c.is_credit_enabled,
      credit_limit: String(c.credit_limit),
    });
  }

  async function handleSaveCreditSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!creditSettingsCustomer) return;
    setIsSubmitting(true);
    try {
      await updateCreditSettings(creditSettingsCustomer.id, {
        is_credit_enabled: creditForm.is_credit_enabled,
        credit_limit: Math.max(0, Number(creditForm.credit_limit) || 0),
      });
      toast.success(`Credit settings updated for ${creditSettingsCustomer.full_name}.`);
      setCreditSettingsCustomer(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update credit settings.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Record Payment ──────────────────────────────────────────────────────────
  function openPaymentModal(c: Customer) {
    setPaymentCustomer(c);
    setPaymentForm({
      amount: String(c.current_balance),
      notes: "",
      autoPrintReceipt: true,
    });
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentCustomer) return;
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) {
      toast.warning("Please enter a valid payment amount greater than ₱0.");
      return;
    }
    if (amount > paymentCustomer.current_balance) {
      toast.warning(`Amount cannot exceed outstanding balance of ${fmt(paymentCustomer.current_balance)}.`);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await recordCreditPayment(paymentCustomer.id, {
        amount,
        notes: paymentForm.notes.trim() || undefined,
      });

      toast.success(
        `Payment of ${fmt(amount)} recorded for ${paymentCustomer.full_name}. Ref: ${res.reference}`
      );

      // Print receipt if requested and store settings exist
      if (paymentForm.autoPrintReceipt && storeSettings) {
        try {
          printCreditPaymentReceipt({
            receiptNumber: res.reference,
            customerName: paymentCustomer.full_name,
            customerCode: paymentCustomer.customer_code,
            amountPaidCents: Math.round(amount * 100),
            newBalanceCents: Math.round(res.new_balance * 100),
            cashierName: user?.full_name || user?.username || "Admin",
            notes: paymentForm.notes || undefined,
            settings: storeSettings,
          });
        } catch (printErr) {
          console.error("Failed to print payment receipt:", printErr);
          toast.info("Payment saved, but could not trigger print.");
        }
      }

      setPaymentCustomer(null);
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to record payment.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Users className="h-6 w-6 text-blue-600" />
            Customer & Credit Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage customer profiles, credit / utang limits, receivables, and payment collection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-10 text-slate-700 bg-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Customers</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{customers.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <PesoSign className="text-2xl" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Receivables</p>
            <p className="text-2xl font-bold text-rose-600 mt-0.5">{fmt(totalReceivables)}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">With Outstanding Balance</p>
            <p className="text-2xl font-bold text-amber-600 mt-0.5">{customersWithBalance}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Credit Accounts</p>
            <p className="text-2xl font-bold text-emerald-600 mt-0.5">{creditEnabledCount}</p>
          </div>
        </div>
      </div>

      {/* ── Search and Filter Controls ───────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search name, code, contact…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 border-slate-200 bg-slate-50/50 focus:bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              statusFilter === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({customers.length})
          </button>
          <button
            onClick={() => setStatusFilter("with_balance")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              statusFilter === "with_balance"
                ? "bg-rose-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            With Balance ({customersWithBalance})
          </button>
          <button
            onClick={() => setStatusFilter("credit_enabled")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              statusFilter === "credit_enabled"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Credit Enabled ({creditEnabledCount})
          </button>
          <button
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              statusFilter === "active"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Active Only
          </button>
        </div>
      </div>

      {/* ── Customers Table ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            <p className="text-sm text-slate-500 font-medium">Loading customers…</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No customers found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {searchQuery ? "Try refining your search terms" : "Click 'Add Customer' to create a customer"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Customer Name</th>
                  <th className="py-3.5 px-4">Contact / Address</th>
                  <th className="py-3.5 px-4 text-right">Credit Limit</th>
                  <th className="py-3.5 px-4 text-right">Current Balance</th>
                  <th className="py-3.5 px-4 text-center">Credit Status</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredCustomers.map((c) => {
                  const isOverLimit = c.is_credit_enabled && c.credit_limit > 0 && c.current_balance > c.credit_limit;
                  const isNearLimit = c.is_credit_enabled && c.credit_limit > 0 && c.current_balance >= c.credit_limit * 0.8 && !isOverLimit;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-500">
                        {c.customer_code}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{c.full_name}</div>
                        {c.business_style && (
                          <span className="text-[11px] text-slate-400">{c.business_style}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {c.contact_number && <div>📞 {c.contact_number}</div>}
                        {c.address && <div className="text-slate-400 truncate">{c.address}</div>}
                        {!c.contact_number && !c.address && <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                        {c.is_credit_enabled ? fmt(c.credit_limit) : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className={`font-bold tabular-nums ${
                          c.current_balance > 0 ? "text-rose-600" : "text-slate-700"
                        }`}>
                          {fmt(c.current_balance)}
                        </div>
                        {isOverLimit && (
                          <span className="inline-block text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 mt-0.5">
                            Over Limit
                          </span>
                        )}
                        {isNearLimit && (
                          <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5">
                            Near Limit
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {c.is_credit_enabled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          c.status === "Active"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                        {/* Receive Payment Button */}
                        {c.current_balance > 0 && (
                          <Button
                            size="sm"
                            onClick={() => openPaymentModal(c)}
                            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 shadow-xs"
                            title="Receive Payment"
                          >
                            <PesoSign className="mr-1 text-sm font-bold" />
                            Pay
                          </Button>
                        )}

                        {/* Statement / Ledger Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/customers/${c.id}/ledger`)}
                          className="h-8 text-slate-700 border-slate-300 text-xs px-2.5"
                          title="View Statement of Account & Ledger History"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1 text-slate-500" />
                          Ledger
                        </Button>

                        {/* Credit Settings */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCreditSettingsModal(c)}
                          className="h-8 text-blue-700 border-blue-200 hover:bg-blue-50 text-xs px-2"
                          title="Configure Credit Limit & Permissions"
                        >
                          <Sliders className="h-3.5 w-3.5" />
                        </Button>

                        {/* Edit Info */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditModal(c)}
                          className="h-8 text-slate-500 hover:text-slate-800 text-xs px-2"
                          title="Edit Customer Profile"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Add Customer ──────────────────────────────────────────────── */}
      <Dialog open={showAddModal} onOpenChange={(o) => { if (!o && !isSubmitting) setShowAddModal(false); }}>
        <DialogContent className="max-w-lg p-0 flex flex-col gap-0 overflow-hidden border-0 shadow-2xl rounded-2xl" showCloseButton={false}>
          <DialogTitle className="sr-only">New Customer Registration</DialogTitle>
          <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-400" />
              <h3 className="font-bold text-base">New Customer Registration</h3>
            </div>
            <button
              onClick={() => setShowAddModal(false)}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Full Name <span className="text-red-500">*</span>
              </label>
              <Input
                required
                placeholder="e.g. Juan Dela Cruz / Apex Construction Corp."
                value={addForm.full_name}
                onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
                className="h-10 text-sm"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Number</label>
                <Input
                  placeholder="0917-000-0000"
                  value={addForm.contact_number}
                  onChange={(e) => setAddForm({ ...addForm, contact_number: e.target.value })}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">TIN</label>
                <Input
                  placeholder="000-000-000-000"
                  value={addForm.tin}
                  onChange={(e) => setAddForm({ ...addForm, tin: e.target.value })}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
              <Input
                placeholder="Street, Barangay, City, Province"
                value={addForm.address}
                onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
                className="h-10 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Business Style</label>
              <Input
                placeholder="e.g. Retail, General Contractor, Trading"
                value={addForm.business_style}
                onChange={(e) => setAddForm({ ...addForm, business_style: e.target.value })}
                className="h-10 text-sm"
              />
            </div>

            {/* Credit Terms Section */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">Enable Credit / Utang</p>
                  <p className="text-[11px] text-slate-500">Allow this customer to purchase on credit</p>
                </div>
                <input
                  type="checkbox"
                  checked={addForm.is_credit_enabled}
                  onChange={(e) => setAddForm({ ...addForm, is_credit_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </div>

              {addForm.is_credit_enabled && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Credit Limit (₱)</label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0.00"
                    value={addForm.credit_limit}
                    onChange={(e) => setAddForm({ ...addForm, credit_limit: e.target.value })}
                    className="h-10 text-sm bg-white"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !addForm.full_name.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Customer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Edit Customer Info ─────────────────────────────────────────── */}
      <Dialog open={!!editCustomer} onOpenChange={(o) => { if (!o && !isSubmitting) setEditCustomer(null); }}>
        <DialogContent className="max-w-lg p-0 flex flex-col gap-0 overflow-hidden border-0 shadow-2xl rounded-2xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Edit Customer</DialogTitle>
          {editCustomer && (
            <>
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Edit2 className="h-5 w-5 text-blue-400" />
                  <h3 className="font-bold text-base">Edit Customer: {editCustomer.full_name}</h3>
                </div>
                <button
                  onClick={() => setEditCustomer(null)}
                  disabled={isSubmitting}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateCustomer} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Full Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Number</label>
                    <Input
                      value={editForm.contact_number}
                      onChange={(e) => setEditForm({ ...editForm, contact_number: e.target.value })}
                      className="h-10 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">TIN</label>
                    <Input
                      value={editForm.tin}
                      onChange={(e) => setEditForm({ ...editForm, tin: e.target.value })}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
                  <Input
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Business Style</label>
                    <Input
                      value={editForm.business_style}
                      onChange={(e) => setEditForm({ ...editForm, business_style: e.target.value })}
                      className="h-10 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Account Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as "Active" | "Inactive" })}
                      className="w-full h-10 rounded-md border border-slate-300 bg-white text-sm px-3 focus:outline-none focus:border-blue-500"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditCustomer(null)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !editForm.full_name.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Changes
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Credit Settings & Limit ────────────────────────────────────── */}
      <Dialog open={!!creditSettingsCustomer} onOpenChange={(o) => { if (!o && !isSubmitting) setCreditSettingsCustomer(null); }}>
        <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden border-0 shadow-2xl rounded-2xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Credit Configuration</DialogTitle>
          {creditSettingsCustomer && (
            <>
              <div className="px-6 py-4 bg-blue-600 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  <h3 className="font-bold text-base">Credit Configuration</h3>
                </div>
                <button
                  onClick={() => setCreditSettingsCustomer(null)}
                  disabled={isSubmitting}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCreditSettings} className="p-6 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1">
                  <div className="font-bold text-sm text-slate-900">{creditSettingsCustomer.full_name}</div>
                  <div className="text-slate-500">Code: {creditSettingsCustomer.customer_code}</div>
                  <div className="text-slate-700 font-semibold pt-1">
                    Outstanding Balance: <span className="text-rose-600">{fmt(creditSettingsCustomer.current_balance)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between border-y border-slate-100 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Enable Credit Purchasing</p>
                    <p className="text-xs text-slate-500">Cashiers can select this customer for Utang sales</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={creditForm.is_credit_enabled}
                    onChange={(e) => setCreditForm({ ...creditForm, is_credit_enabled: e.target.checked })}
                    className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Approved Credit Limit (₱)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">₱</span>
                    <Input
                      type="number"
                      min="0"
                      step="500"
                      placeholder="0.00"
                      value={creditForm.credit_limit}
                      onChange={(e) => setCreditForm({ ...creditForm, credit_limit: e.target.value })}
                      className="pl-8 h-10 text-sm font-semibold"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    If customer's balance reaches this limit, cashier will require real-time admin override.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setCreditSettingsCustomer(null)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Settings
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: Receive Payment ────────────────────────────────────────────── */}
      <Dialog open={!!paymentCustomer} onOpenChange={(o) => { if (!o && !isSubmitting) setPaymentCustomer(null); }}>
        <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden border-0 shadow-2xl rounded-2xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Receive Credit Payment</DialogTitle>
          {paymentCustomer && (
            <>
              <div className="px-6 py-4 bg-emerald-600 text-white flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <PesoSign className="text-xl" />
                  <h3 className="font-bold text-base">Receive Credit Payment</h3>
                </div>
                <button
                  onClick={() => setPaymentCustomer(null)}
                  disabled={isSubmitting}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs space-y-1.5">
                  <div className="font-bold text-sm text-slate-900">{paymentCustomer.full_name}</div>
                  <div className="flex justify-between text-slate-600">
                    <span>Customer Code</span>
                    <span className="font-mono font-medium">{paymentCustomer.customer_code}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-emerald-950 pt-1 border-t border-emerald-200">
                    <span>Total Outstanding Balance</span>
                    <span className="text-rose-700">{fmt(paymentCustomer.current_balance)}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-slate-700">Amount to Pay (₱)</label>
                    <button
                      type="button"
                      onClick={() => setPaymentForm({ ...paymentForm, amount: String(paymentCustomer.current_balance) })}
                      className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800"
                    >
                      Pay Full Balance
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500">₱</span>
                    <Input
                      type="number"
                      min="0.01"
                      max={paymentCustomer.current_balance}
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      className="pl-8 h-12 text-lg font-bold text-slate-900"
                      autoFocus
                    />
                  </div>
                </div>

                {Number(paymentForm.amount) > 0 && (
                  <div className="text-xs flex justify-between px-1 text-slate-600">
                    <span>Remaining Balance After Payment:</span>
                    <span className="font-bold text-slate-900">
                      {fmt(Math.max(0, paymentCustomer.current_balance - Number(paymentForm.amount)))}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Check No. / Ref (optional)</label>
                  <Input
                    placeholder="e.g. Check #12345 / Cash payment"
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    className="h-10 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="print-receipt-chk"
                    checked={paymentForm.autoPrintReceipt}
                    onChange={(e) => setPaymentForm({ ...paymentForm, autoPrintReceipt: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="print-receipt-chk" className="text-xs text-slate-700 font-medium flex items-center gap-1 cursor-pointer">
                    <Printer className="h-3.5 w-3.5 text-slate-500" />
                    Print Collection Receipt upon confirmation
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setPaymentCustomer(null)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || !Number(paymentForm.amount) || Number(paymentForm.amount) <= 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirm & Receive {Number(paymentForm.amount) > 0 ? fmt(Number(paymentForm.amount)) : ""}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
