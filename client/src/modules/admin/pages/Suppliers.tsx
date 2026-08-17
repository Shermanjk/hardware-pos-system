import { Button } from "@/components/ui/button";
import {
    Dialog, DialogContent,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Supplier } from "@/shared/api/productsApi";
import { createSupplier, deleteSupplier, getSuppliers, updateSupplier } from "@/shared/api/productsApi";
import DraftRecoveryPrompt from "@/shared/components/DraftRecoveryPrompt";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import { DRAFT_KEYS, useDraftRecovery } from "@/shared/hooks/useDraftRecovery";
import axios from "axios";
import {
    AlertCircle,
    Edit2,
    Mail, MapPin, Package,
    Phone,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Truck,
    User,
    X,
} from "lucide-react";
import { useEffect, useState } from "react";

// ─── Extended type with product_count ─────────────────────────────────────────
interface SupplierRecord extends Supplier {
  product_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (body?.message) return body.message;
    if (body?.errors?.[0]?.message) return body.errors[0].message;
  }
  return "An unexpected error occurred.";
}

function statusBadge(status?: string) {
  return status === "Active"
    ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">Active</span>
    : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">Inactive</span>;
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

interface SupplierFormModalProps {
  mode: "add" | "edit";
  open: boolean;
  initial?: SupplierRecord | null;
  onClose: () => void;
  onSaved: (supplier: SupplierRecord) => void;
}

function emptyForm() {
  return {
    supplier_name:  "",
    contact_person: "",
    contact_number: "",
    email:          "",
    address:        "",
    status:         "Active" as "Active" | "Inactive",
  };
}

function SupplierFormModal({ mode, open, initial, onClose, onSaved }: SupplierFormModalProps) {
  const [form,      setForm]      = useState(emptyForm());
  const [errors,    setErrors]    = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // ── Draft recovery (add mode only) ───────────────────────────────────────
  const supplierDraft = useDraftRecovery<{ form: ReturnType<typeof emptyForm>; savedAt: string }>(DRAFT_KEYS.ADMIN_SUPPLIER_ADD);
  const [recoverableDraft, setRecoverableDraft] = useState<{ form: ReturnType<typeof emptyForm>; savedAt: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm({
        supplier_name:  initial.supplier_name  ?? "",
        contact_person: initial.contact_person ?? "",
        contact_number: initial.contact_number ?? "",
        email:          initial.email          ?? "",
        address:        initial.address        ?? "",
        status:         (initial.status as "Active" | "Inactive") ?? "Active",
      });
      setRecoverableDraft(null);
    } else if (mode === "add") {
      const draft = supplierDraft.getRecoverableDraft();
      if (draft?.form?.supplier_name) {
        setForm(draft.form);
        setRecoverableDraft(draft);
      } else {
        setForm(emptyForm());
        setRecoverableDraft(null);
      }
    }
    setErrors({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // Auto-save draft for add mode
  useEffect(() => {
    if (!open || mode !== "add") return;
    if (form.supplier_name) {
      supplierDraft.saveDraft({ form, savedAt: new Date().toISOString() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  const set = (key: keyof ReturnType<typeof emptyForm>, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplier_name.trim()) {
      setErrors({ supplier_name: "Supplier name is required." });
      return;
    }
    setErrors({});
    setIsLoading(true);
    try {
      const payload = {
        supplier_name:  form.supplier_name.trim(),
        contact_person: form.contact_person.trim() || null,
        contact_number: form.contact_number.trim() || null,
        email:          form.email.trim() || null,
        address:        form.address.trim() || null,
        status:         form.status,
      };
      const raw = mode === "add"
        ? await createSupplier(payload)
        : await updateSupplier(initial!.id, payload);
      // ── Clear draft on success ──────────────────────────────────────────
      supplierDraft.commitDraft();
      onSaved({ ...raw, product_count: initial?.product_count ?? 0 } as SupplierRecord);
      onClose();
    } catch (err) {
      const msg = extractError(err);
      setErrors({ general: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const isAdd = mode === "add";

  return (
    <>
      {/* Draft recovery prompt — add mode only */}
      {mode === "add" && (
        <DraftRecoveryPrompt
          draft={recoverableDraft}
          formLabel="Add Supplier"
          savedSummary={
            recoverableDraft
              ? `${recoverableDraft.form.supplier_name}${recoverableDraft.savedAt ? ` · Saved: ${new Date(recoverableDraft.savedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
              : undefined
          }
          onRestore={() => setRecoverableDraft(null)}
          onDiscard={() => {
            supplierDraft.discardDraft();
            setForm(emptyForm());
            setRecoverableDraft(null);
          }}
        />
      )}
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">{isAdd ? "Add New Supplier" : "Edit Supplier"}</DialogTitle>
        {/* Colored header */}
        <div className={`flex items-center gap-3 px-6 py-4 rounded-t-lg ${isAdd ? "bg-blue-400" : "bg-gray-500"}`}>
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{isAdd ? "Add New Supplier" : "Edit Supplier"}</h2>
            <p className={`text-xs mt-0.5 ${isAdd ? "text-blue-100" : "text-gray-300"}`}>
              {isAdd ? "Fill in the supplier information below" : "Update supplier details"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            {errors.general && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{errors.general}</p>
              </div>
            )}

            {/* Supplier Name */}
            <div>
              <Label className="mb-1.5 block font-semibold">
                Supplier Name <span className="text-red-500">*</span>
              </Label>
              <Input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)}
                placeholder="e.g. BuildCo Supplies" disabled={isLoading} autoFocus
                className={`border-2 ${errors.supplier_name ? "border-red-400" : "border-gray-300 hover:border-blue-400 focus:border-blue-500"}`} />
              {errors.supplier_name && <p className="mt-1 text-xs text-red-600">{errors.supplier_name}</p>}
            </div>

            {/* Contact Person + Number */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block font-semibold text-sm">
                  Contact Person <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)}
                  placeholder="e.g. Juan dela Cruz" disabled={isLoading}
                  className="border-2 border-gray-300 hover:border-blue-400 focus:border-blue-500" />
              </div>
              <div>
                <Label className="mb-1.5 block font-semibold text-sm">
                  Contact Number <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input value={form.contact_number} onChange={(e) => set("contact_number", e.target.value)}
                  placeholder="e.g. 09171234567" disabled={isLoading}
                  className="border-2 border-gray-300 hover:border-blue-400 focus:border-blue-500" />
              </div>
            </div>

            {/* Email */}
            <div>
              <Label className="mb-1.5 block font-semibold text-sm">
                Email <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                placeholder="e.g. supplier@example.com" disabled={isLoading}
                className={`border-2 ${errors.email ? "border-red-400" : "border-gray-300 hover:border-blue-400 focus:border-blue-500"}`} />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
            </div>

            {/* Address */}
            <div>
              <Label className="mb-1.5 block font-semibold text-sm">
                Address <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <textarea value={form.address} onChange={(e) => set("address", e.target.value)}
                rows={2} disabled={isLoading}
                placeholder="Street, City, Province"
                className="w-full border-2 border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 hover:border-blue-400 disabled:opacity-50" />
            </div>

            {/* Status */}
            <div>
              <Label className="mb-1.5 block font-semibold text-sm">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)} disabled={isLoading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isLoading && <LoadingSpinner size={16} className="mr-2 text-white" />}
              {isLoading ? "Saving…" : isAdd ? "Add Supplier" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

interface DeleteDialogProps {
  supplier: SupplierRecord | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
}

function DeleteDialog({ supplier, onClose, onDeleted }: DeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => { if (supplier) setError(null); }, [supplier]);

  const handleConfirm = async () => {
    if (!supplier) return;
    setIsLoading(true);
    try {
      await deleteSupplier(supplier.id);
      onDeleted(supplier.id);
      onClose();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={!!supplier} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Delete Supplier</DialogTitle>
        {/* Red header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-400 rounded-t-lg">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Trash2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Delete Supplier</h2>
            <p className="text-xs text-red-100 mt-0.5">This action cannot be undone</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Supplier name in gray card */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm font-semibold text-gray-900">{supplier?.supplier_name}</p>
          </div>
          <p className="text-sm text-gray-700">
            This will permanently delete this supplier. Suppliers linked to active products cannot be deleted.
          </p>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white gap-2">
            {isLoading && <LoadingSpinner size={16} className="text-white" />}
            {isLoading ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────

function ViewModal({ supplier, onClose, onEdit }: {
  supplier: SupplierRecord | null;
  onClose: () => void;
  onEdit: (s: SupplierRecord) => void;
}) {
  if (!supplier) return null;
  return (
    <Dialog open={!!supplier} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Supplier Details</DialogTitle>
        {/* Slate header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-slate-500 rounded-t-lg">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Supplier Details</h2>
            <p className="text-xs text-slate-300 mt-0.5">View supplier information</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-lg font-bold text-gray-900">{supplier.supplier_name}</p>
            {statusBadge(supplier.status)}
          </div>

          <div className="grid grid-cols-1 gap-2.5 text-sm">
            {supplier.contact_person && (
              <div className="flex items-center gap-2.5 text-gray-700">
                <User className="h-4 w-4 text-gray-400 shrink-0" />
                <span>{supplier.contact_person}</span>
              </div>
            )}
            {supplier.contact_number && (
              <div className="flex items-center gap-2.5 text-gray-700">
                <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                <span>{supplier.contact_number}</span>
              </div>
            )}
            {supplier.email && (
              <div className="flex items-center gap-2.5 text-gray-700">
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                <a href={`mailto:${supplier.email}`} className="text-blue-600 hover:underline">{supplier.email}</a>
              </div>
            )}
            {(supplier.contact_person || supplier.contact_number || supplier.email) && supplier.address && (
              <div className="border-t border-gray-100 my-1" />
            )}
            {supplier.address && (
              <div className="flex items-start gap-2.5 text-gray-700">
                <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                <span>{supplier.address}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-gray-700">
              <Package className="h-4 w-4 text-gray-400 shrink-0" />
              <span>
                <span className="font-semibold text-gray-900">{supplier.product_count}</span> active product{supplier.product_count !== 1 ? "s" : ""}
                {supplier.product_count > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                    Used in {supplier.product_count} product{supplier.product_count !== 1 ? "s" : ""}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            onClick={() => { onClose(); onEdit(supplier); }}>
            <Edit2 className="h-4 w-4" /> Edit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Suppliers Page ──────────────────────────────────────────────────────

export default function Suppliers() {
  const [suppliers,    setSuppliers]    = useState<SupplierRecord[]>([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [showAdd,      setShowAdd]      = useState(false);
  const [editTarget,   setEditTarget]   = useState<SupplierRecord | null>(null);
  const [viewTarget,   setViewTarget]   = useState<SupplierRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierRecord | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getSuppliers() as SupplierRecord[];
      setSuppliers(data);
    } catch {
      setLoadError("Failed to load suppliers.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSaved = (s: SupplierRecord) => {
    setSuppliers((prev) => {
      const exists = prev.find((x) => x.id === s.id);
      return exists ? prev.map((x) => x.id === s.id ? s : x) : [s, ...prev];
    });
    showToast(`"${s.supplier_name}" saved.`);
  };

  const handleDeleted = (id: number) => {
    const s = suppliers.find((x) => x.id === id);
    setSuppliers((prev) => prev.filter((x) => x.id !== id));
    showToast(`"${s?.supplier_name}" deleted.`);
  };

  const filtered = suppliers.filter((s) => {
    const matchSearch = s.supplier_name.toLowerCase().includes(search.toLowerCase())
      || (s.contact_person ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const activeCount   = suppliers.filter((s) => s.status === "Active").length;
  const inactiveCount = suppliers.filter((s) => s.status === "Inactive").length;

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium bg-emerald-600 text-white border border-emerald-700">
          {toast}
          <button onClick={() => setToast(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your supplier contacts and information</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-gray-300 text-gray-600 hover:bg-gray-100"
            onClick={load} disabled={isLoading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm shadow-sm"
            onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Suppliers", value: suppliers.length, color: "text-blue-600",    bg: "bg-blue-50",    icon: Truck },
          { label: "Active",          value: activeCount,       color: "text-emerald-600", bg: "bg-emerald-50", icon: Truck },
          { label: "Inactive",        value: inactiveCount,     color: "text-gray-500",    bg: "bg-gray-100",   icon: Truck },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-300 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">{c.label}</p>
              {isLoading
                ? <div className="h-6 w-8 bg-gray-100 rounded animate-pulse mt-1" />
                : <p className={`text-2xl font-bold ${c.color} tabular-nums`}>{c.value}</p>
              }
            </div>
          </div>
        ))}
      </div>

      {/* Error */}
      {loadError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{loadError}</p>
          <button onClick={load} className="text-red-600 text-sm font-semibold hover:underline">Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-4.5">
        <div className="flex gap-3.5 flex-wrap">
          <div className="flex-1 min-w-48 flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:border-slate-400 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-xs">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or contact…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400 text-slate-800 font-medium" />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40 bg-gray-50 border-gray-200 text-gray-700 h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {(search || filterStatus !== "all") && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
              <button onClick={() => { setSearch(""); setFilterStatus("all"); }}
                className="text-blue-600 font-semibold hover:underline">Clear</button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Supplier Name</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Contact Person</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Contact Number</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Email Address</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Products</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Status</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-12" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                        <Truck className="h-7 w-7 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">
                          {search || filterStatus !== "all" ? "No suppliers match your search" : "No suppliers registered yet"}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {search || filterStatus !== "all" ? "Try different filters" : "Add your first supplier to get started"}
                        </p>
                      </div>
                      {search || filterStatus !== "all" ? (
                        <button onClick={() => { setSearch(""); setFilterStatus("all"); }} className="text-blue-600 text-sm font-bold hover:underline cursor-pointer">
                          Clear filters
                        </button>
                      ) : (
                        <button onClick={() => setShowAdd(true)} className="text-blue-600 text-sm font-bold hover:underline cursor-pointer">
                          Add a supplier
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          <Truck className="h-4 w-4 text-blue-600" />
                        </div>
                        <p className="font-bold text-slate-900">{supplier.supplier_name}</p>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-slate-600 text-sm font-medium">{supplier.contact_person || <span className="text-slate-300">—</span>}</td>
                    <td className="py-3.5 px-5 font-mono text-sm">
                      {supplier.contact_number
                        ? <a href={`tel:${supplier.contact_number}`} className="text-blue-600 font-medium hover:underline">{supplier.contact_number}</a>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3.5 px-5">
                      {supplier.email
                        ? <a href={`mailto:${supplier.email}`} className="text-blue-600 font-medium hover:underline text-sm truncate max-w-[180px] block">{supplier.email}</a>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className="inline-flex items-center gap-1 text-sm font-bold font-mono text-slate-700 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md">
                        <Package className="h-3.5 w-3.5 text-slate-400" />
                        {supplier.product_count}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">{statusBadge(supplier.status)}</td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title="View details"
                          onClick={() => setViewTarget(supplier)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        >
                          <Search className="h-4 w-4" />
                        </button>
                        <button
                          title="Edit"
                          onClick={() => setEditTarget(supplier)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => setDeleteTarget(supplier)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && filtered.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-600 font-bold">{filtered.length} supplier{filtered.length !== 1 ? "s" : ""} registered</p>
            <p className="text-xs text-slate-400 font-medium">Isra Hardware POS</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <SupplierFormModal mode="add" open={showAdd}
        onClose={() => setShowAdd(false)} onSaved={handleSaved} />
      <SupplierFormModal mode="edit" open={!!editTarget} initial={editTarget}
        onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      <ViewModal supplier={viewTarget}
        onClose={() => setViewTarget(null)} onEdit={(s) => setEditTarget(s)} />
      <DeleteDialog supplier={deleteTarget}
        onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
    </div>
  );
}
