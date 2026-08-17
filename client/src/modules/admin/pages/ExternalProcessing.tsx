import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Truck, Package, RefreshCw, AlertCircle, X, Search, Plus, Building2,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import {
  createEprCompany, updateEprCompany, deleteEprCompany,
  recordEprDelivery, getEprDeliveries, getEprCompanies,
  type ExternalProcessingCompany, type ExternalProcessingDelivery,
  type RecordDeliveryPayload,
} from "@/shared/api/commodityApi";
import { getProducts, type ProductRecord } from "@/shared/api/productsApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} />;
}

function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (body?.message) return body.message;
  }
  return "An unexpected error occurred.";
}

type TabType = "record" | "history";

// ─── Delivery Form ────────────────────────────────────────────────────────────

function DeliveryForm({ onSaved, companiesRefreshKey }: { onSaved: () => void; companiesRefreshKey: number }) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [companies, setCompanies] = useState<ExternalProcessingCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [companyId, setCompanyId] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveredBy, setDeliveredBy] = useState("");
  const [remarks, setRemarks] = useState("");

  const selectedProduct = products.find((p) => p.id === Number(productId));
  const availableStock = selectedProduct ? Number(selectedProduct.quantity) : 0;
  const qtyNum = parseFloat(quantity) || 0;
  const remainingAfter = Math.max(0, Math.round((availableStock - qtyNum) * 1000) / 1000);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allProducts, allCompanies] = await Promise.all([getProducts(), getEprCompanies()]);
      setProducts(allProducts.filter((p) => p.pricing_type === "MARKET_BASED" && p.product_usage !== "RETAIL_PRODUCT"));
      setCompanies(allCompanies);
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData, companiesRefreshKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productId)              { setError("Please select a product."); return; }
    if (!companyId)              { setError("Please select a processing company."); return; }
    if (!quantity || qtyNum <= 0){ setError("Quantity must be greater than 0."); return; }
    if (qtyNum > availableStock) { setError(`Insufficient stock. Available: ${availableStock}. Requested: ${qtyNum}.`); return; }
    if (!deliveryDate)           { setError("Delivery date is required."); return; }

    setSaving(true);
    try {
      const payload: RecordDeliveryPayload = {
        product_id:    Number(productId),
        quantity:      qtyNum,
        company_id:    Number(companyId),
        delivery_date: deliveryDate,
        delivered_by:  deliveredBy.trim() || null,
        remarks:       remarks.trim() || null,
      };
      const result = await recordEprDelivery(payload);
      toast.success(`Delivery recorded! ${result.delivery_reference} — ${result.remaining_stock} remaining`);
      setProductId("");
      setQuantity("");
      setCompanyId("");
      setDeliveredBy("");
      setRemarks("");
      onSaved();
      loadData();
    } catch (err) {
      setError(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5">
      {loading ? (
        <div className="py-8 text-center text-gray-400 flex items-center justify-center gap-2">
          <Spinner className="text-blue-500" /> Loading form data…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Product */}
          <div>
            <Label className="mb-1.5 block font-semibold">Product <span className="text-red-500">*</span></Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Select commodity product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.product_name} — Stock: {Number(p.quantity).toLocaleString("en-PH", { maximumFractionDigits: 3 })} {p.unit_abbreviation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Available Stock Preview */}
          {selectedProduct && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm space-y-1">
              <p className="text-blue-700">
                <span className="font-semibold">Available Stock:</span>{" "}
                {availableStock.toLocaleString("en-PH", { maximumFractionDigits: 3 })} {selectedProduct.unit_abbreviation}
              </p>
              {qtyNum > 0 && (
                <>
                  <p className="text-blue-700">
                    <span className="font-semibold">Quantity to Deliver:</span>{" "}
                    {qtyNum.toLocaleString("en-PH", { maximumFractionDigits: 3 })} {selectedProduct.unit_abbreviation}
                  </p>
                  <p className={`font-semibold ${qtyNum > availableStock ? "text-red-600" : "text-emerald-700"}`}>
                    <span className="font-semibold">Remaining After Delivery:</span>{" "}
                    {remainingAfter.toLocaleString("en-PH", { maximumFractionDigits: 3 })} {selectedProduct.unit_abbreviation}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Quantity */}
          <div>
            <Label className="mb-1.5 block font-semibold">Quantity Delivered <span className="text-red-500">*</span></Label>
            <Input
              type="number" min="0" step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 500"
              className="border-gray-300"
            />
            <p className="mt-1 text-xs text-gray-400">Decimal quantities supported (e.g., 100.500)</p>
          </div>

          {/* Processing Company + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block font-semibold">Processing Company <span className="text-red-500">*</span></Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger className="border-gray-300">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block font-semibold">Delivery Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="border-gray-300"
              />
            </div>
          </div>

          {/* Delivered By */}
          <div>
            <Label className="mb-1.5 block font-semibold">Delivered By <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input
              value={deliveredBy}
              onChange={(e) => setDeliveredBy(e.target.value)}
              placeholder="e.g. Juan Dela Cruz"
              className="border-gray-300"
            />
          </div>

          {/* Remarks */}
          <div>
            <Label className="mb-1.5 block font-semibold">Remarks <span className="text-gray-400 font-normal">(optional)</span></Label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Delivery notes…"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            {saving && <Spinner className="text-white" />}
            {saving ? "Recording…" : "Record Delivery"}
          </Button>
        </form>
      )}
    </div>
  );
}

// ─── Manage Companies Dialog ──────────────────────────────────────────────────

function CompanyForm({
  initial, onSave, onCancel, saving, error,
}: {
  initial?: ExternalProcessingCompany;
  onSave: (name: string, address: string, contact: string) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [name, setName]       = useState(initial?.name    ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");

  return (
    <div className="space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
      {error && (
        <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" /> {error}
        </div>
      )}
      <div>
        <Label className="mb-1 block text-xs font-semibold">Company Name <span className="text-red-500">*</span></Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Processing" className="h-8 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1 block text-xs font-semibold text-gray-500">Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
        </div>
        <div>
          <Label className="mb-1 block text-xs font-semibold text-gray-500">Contact</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={() => onSave(name, address, contact)} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
          {saving && <Spinner className="text-white" />}
          {initial ? "Save Changes" : "Add Company"}
        </Button>
      </div>
    </div>
  );
}

function ManageCompaniesDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [companies, setCompanies] = useState<ExternalProcessingCompany[]>([]);
  const [loading, setLoading]     = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExternalProcessingCompany | null>(null);
  const [deleting, setDeleting]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCompanies(await getEprCompanies()); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) { load(); setShowAdd(false); setEditingId(null); } }, [open, load]);

  const handleAdd = async (name: string, address: string, contact: string) => {
    if (!name.trim()) { setFormError("Company name is required."); return; }
    setSaving(true); setFormError(null);
    try {
      await createEprCompany({ name: name.trim(), address: address.trim() || null, contact: contact.trim() || null });
      toast.success("Company added.");
      setShowAdd(false);
      onChanged();
      load();
    } catch (err) { setFormError(extractError(err)); }
    finally { setSaving(false); }
  };

  const handleEdit = async (name: string, address: string, contact: string) => {
    if (!name.trim()) { setFormError("Company name is required."); return; }
    setSaving(true); setFormError(null);
    try {
      await updateEprCompany(editingId!, { name: name.trim(), address: address.trim() || null, contact: contact.trim() || null });
      toast.success("Company updated.");
      setEditingId(null);
      onChanged();
      load();
    } catch (err) { setFormError(extractError(err)); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const result = await deleteEprCompany(confirmDelete.id);
      toast.success(result.message);
      setConfirmDelete(null);
      onChanged();
      load();
    } catch (err) { toast.error(extractError(err)); }
    finally { setDeleting(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg p-0 flex flex-col gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Processing Companies</DialogTitle>
          {/* Blue header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-blue-400 rounded-t-lg">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Processing Companies</h2>
              <p className="text-xs text-blue-100 mt-0.5">Manage external processing partners</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Add form */}
            {showAdd ? (
              <CompanyForm
                onSave={handleAdd}
                onCancel={() => { setShowAdd(false); setFormError(null); }}
                saving={saving}
                error={formError}
              />
            ) : (
              <Button variant="outline" size="sm" className="w-full gap-2 border-dashed border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"
                onClick={() => { setShowAdd(true); setEditingId(null); setFormError(null); }}>
                <Plus className="h-4 w-4" /> Add New Company
              </Button>
            )}

            {/* Company list */}
            {loading ? (
              <div className="py-6 text-center text-gray-400 flex items-center justify-center gap-2">
                <Spinner className="text-blue-500" /> Loading…
              </div>
            ) : companies.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-4">No companies yet. Add one above.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {companies.map((c) => (
                  <div key={c.id}>
                    {editingId === c.id ? (
                      <div className="p-2">
                        <CompanyForm
                          initial={c}
                          onSave={handleEdit}
                          onCancel={() => { setEditingId(null); setFormError(null); }}
                          saving={saving}
                          error={formError}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <Building2 className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{c.name}</p>
                          {(c.address || c.contact) && (
                            <p className="text-xs text-gray-400 truncate">
                              {[c.address, c.contact].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button title="Edit"
                            onClick={() => { setEditingId(c.id); setShowAdd(false); setFormError(null); }}
                            className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button title="Remove"
                            onClick={() => setConfirmDelete(c)}
                            className="h-7 w-7 flex items-center justify-center rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete nested dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm p-0 flex flex-col gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Remove Company</DialogTitle>
          {/* Red header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-red-400 rounded-t-lg">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Trash2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Remove Company</h2>
              <p className="text-xs text-red-100 mt-0.5">This action cannot be undone</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-sm font-semibold text-gray-900">{confirmDelete?.name}</p>
              {(confirmDelete?.address || confirmDelete?.contact) && (
                <p className="text-xs text-gray-500 mt-0.5">{[confirmDelete?.address, confirmDelete?.contact].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <p className="text-sm text-gray-700">
              If this company has existing delivery records, it will be <strong>deactivated</strong> instead of permanently deleted.
            </p>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white gap-2">
              {deleting && <Spinner className="text-white" />}
              {deleting ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Delivery History ─────────────────────────────────────────────────────────

function DeliveryHistory({ refreshKey }: { refreshKey: number }) {
  const [deliveries, setDeliveries] = useState<ExternalProcessingDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedDelivery, setSelectedDelivery] = useState<ExternalProcessingDelivery | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      console.log("[DeliveryHistory] Loading deliveries with filters:", { search, dateFrom, dateTo });
      const data = await getEprDeliveries({
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 100,
      });
      console.log("[DeliveryHistory] Loaded deliveries:", data);
      setDeliveries(data);
    } catch (err) {
      console.error("[DeliveryHistory] Failed to load deliveries:", err);
      toast.error("Failed to load delivery records");
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <>
      {/* Filters */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 focus-within:border-blue-400 transition-all">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ref, company, product…"
              className="flex-1 bg-transparent text-sm focus:outline-none min-w-0 text-gray-800" />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-500 mb-1 block">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm w-36" />
        </div>
        <div>
          <Label className="text-xs font-semibold text-gray-500 mb-1 block">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm w-36" />
        </div>
        <div className="flex items-end gap-2">
          {(search || dateFrom || dateTo) && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
          <button
            onClick={load}
            className="h-8 w-8 flex items-center justify-center rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400 flex items-center justify-center gap-2">
          <Spinner className="text-blue-500" /> Loading…
        </div>
      ) : deliveries.length === 0 ? (
        <div className="py-10 text-center">
          <Truck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No delivery records found</p>
          <p className="text-xs text-gray-400 mt-1">Switch to the Record tab to log a delivery.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Reference", "Delivery Date", "Product", "Quantity", "Processing Company", "Delivered By", "Recorded By"].map((h, i) => (
                  <th key={i} className={`py-3.5 px-4 font-bold text-slate-700 text-xs uppercase tracking-wide whitespace-nowrap ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.map((d, idx) => (
                <tr 
                  key={d.id} 
                  className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                  onClick={() => setSelectedDelivery(d)}
                >
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">
                      {d.delivery_reference}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600 font-medium">{fmtDate(d.delivery_date)}</td>
                  <td className="py-3.5 px-4">
                    <p className="font-bold text-slate-900">{d.product_name}</p>
                    <p className="text-xs text-slate-400 font-medium">{d.unit_abbreviation}</p>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-mono tabular-nums">
                    {Number(d.quantity).toLocaleString("en-PH", { maximumFractionDigits: 3 })}
                  </td>
                  <td className="py-3.5 px-4 text-sm font-semibold text-slate-800">{d.company_name}</td>
                  <td className="py-3.5 px-4 text-sm text-slate-600 font-medium">{d.delivered_by || <span className="text-slate-300">—</span>}</td>
                  <td className="py-3.5 px-4 text-xs text-slate-500">{d.recorded_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-600 font-bold">{deliveries.length} delivery record{deliveries.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-slate-400 font-medium">Isra Hardware POS</p>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      <Dialog open={!!selectedDelivery} onOpenChange={(o) => { if (!o) setSelectedDelivery(null); }}>
        <DialogContent className="max-w-md p-0 flex flex-col gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Delivery Details</DialogTitle>
          {/* Slate header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-slate-500 rounded-t-lg">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Delivery Details</h2>
              <p className="text-xs text-slate-300 mt-0.5 font-mono">{selectedDelivery?.delivery_reference ?? ""}</p>
            </div>
          </div>
          {selectedDelivery && (
            <div className="px-6 py-5 space-y-4 text-sm">
              {/* Transaction info */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div><span className="text-gray-500 text-xs block mb-0.5">Reference</span><span className="font-mono font-bold text-gray-900">{selectedDelivery.delivery_reference}</span></div>
                <div><span className="text-gray-500 text-xs block mb-0.5">Recorded At</span><span className="font-medium text-gray-800">{fmtDateTime(selectedDelivery.created_at)}</span></div>
                <div><span className="text-gray-500 text-xs block mb-0.5">Product</span><span className="font-semibold text-gray-900">{selectedDelivery.product_name}</span></div>
                <div><span className="text-gray-500 text-xs block mb-0.5">Quantity</span><span className="font-bold text-gray-900">{Number(selectedDelivery.quantity).toLocaleString("en-PH", { maximumFractionDigits: 3 })} {selectedDelivery.unit_abbreviation}</span></div>
                <div><span className="text-gray-500 text-xs block mb-0.5">Company</span><span className="font-medium text-gray-800">{selectedDelivery.company_name}</span></div>
                <div><span className="text-gray-500 text-xs block mb-0.5">Delivery Date</span><span className="font-medium text-gray-800">{fmtDate(selectedDelivery.delivery_date)}</span></div>
                <div><span className="text-gray-500 text-xs block mb-0.5">Delivered By</span><span className="font-medium text-gray-800">{selectedDelivery.delivered_by || "—"}</span></div>
                <div><span className="text-gray-500 text-xs block mb-0.5">Recorded By</span><span className="font-medium text-gray-800">{selectedDelivery.recorded_by_name}</span></div>
              </div>
              {selectedDelivery.remarks && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Remarks</p>
                  <p className="text-gray-700">{selectedDelivery.remarks}</p>
                </div>
              )}
            </div>
          )}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <Button variant="outline" onClick={() => setSelectedDelivery(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExternalProcessing() {
  const [activeTab, setActiveTab] = useState<TabType>("record");
  const [refreshKey, setRefreshKey] = useState(0);
  const [showManageCompanies, setShowManageCompanies] = useState(false);

  const TabButton = ({ tab, icon: Icon, label }: { tab: TabType; icon: React.ElementType; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-all ${
        activeTab === tab
          ? "border-blue-500 text-blue-800 bg-white"
          : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      <Icon className={`h-4 w-4 ${activeTab === tab ? "text-blue-600" : "text-gray-400"}`} />
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">External Processing Delivery</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Record and audit deliveries of raw materials / commodities to external processing facilities
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-100"
          onClick={() => setShowManageCompanies(true)}
        >
          <Building2 className="h-4 w-4" /> Manage Companies
        </Button>
      </div>

      {/* Info banner */}
      <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
        <strong>About this feature:</strong> This is a record-keeping and inventory deduction tool, not a sales or purchase transaction.
        Deliveries are permanently recorded for Admin audit. Inventory is deducted immediately upon recording.
      </div>

      {/* Tabbed Panel */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Tab Bar */}
        <div className="flex items-center border-b border-gray-200 bg-gray-50">
          <TabButton tab="record"  icon={Truck}   label="Record Delivery" />
          <TabButton tab="history" icon={Package} label="Delivery History" />
        </div>

        {/* Tab Content */}
        {activeTab === "record" && (
          <DeliveryForm onSaved={() => { setRefreshKey((k) => k + 1); setActiveTab("history"); }} companiesRefreshKey={refreshKey} />
        )}
        {activeTab === "history" && (
          <DeliveryHistory refreshKey={refreshKey} />
        )}
      </div>

      <ManageCompaniesDialog
        open={showManageCompanies}
        onClose={() => setShowManageCompanies(false)}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
