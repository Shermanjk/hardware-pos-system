import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <SheetContent side="right" className="w-[90vw] sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden border-l border-gray-200 [&>button]:text-white">
          <SheetTitle className="sr-only">Processing Companies</SheetTitle>
          {/* Blue header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-blue-400 rounded-t-lg shrink-0">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Processing Companies</h2>
              <p className="text-xs text-blue-100 mt-0.5">Manage external processing partners</p>
            </div>
          </div>

          <div className="px-6 py-5 space-y-3 overflow-y-auto flex-1">
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

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Confirm delete nested dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="max-w-sm p-0 flex flex-col gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Confirm Delete</DialogTitle>
          <div className="p-6 space-y-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto text-red-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-gray-900 text-base">Delete Company?</h3>
              <p className="text-xs text-gray-500 mt-1">
                Are you sure you want to remove <strong>{confirmDelete?.name}</strong>? Delivery records linked to this company will not be deleted.
              </p>
            </div>
          </div>
          <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting} className="gap-1.5">
              {deleting && <Spinner className="text-white" />}
              {deleting ? "Deleting…" : "Delete Company"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Delivery History Tab ─────────────────────────────────────────────────────

function DeliveryHistoryTab({ refreshKey }: { refreshKey: number }) {
  const [deliveries, setDeliveries] = useState<ExternalProcessingDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<ExternalProcessingDelivery | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getEprDeliveries();
      setDeliveries(data);
    } catch {
      toast.error("Failed to load delivery records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = deliveries.filter((d) =>
    d.product_name.toLowerCase().includes(search.toLowerCase()) ||
    d.company_name.toLowerCase().includes(search.toLowerCase()) ||
    d.delivery_reference.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product, company, reference…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2 shrink-0">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400 flex items-center justify-center gap-2">
          <Spinner className="text-blue-500" /> Loading deliveries…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
          <Truck className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-600">No delivery records found</p>
          <p className="text-xs text-gray-400 mt-1">Record a delivery using the form on the left.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Reference</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Product</th>
                <th className="text-right px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Quantity</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Company</th>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Delivered By</th>
                <th className="text-center px-5 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{fmtDate(d.delivery_date)}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-600">{d.delivery_reference}</td>
                  <td className="px-5 py-3.5 font-bold text-slate-900">{d.product_name}</td>
                  <td className="px-5 py-3.5 text-right font-bold text-slate-900 tabular-nums">
                    {Number(d.quantity).toLocaleString("en-PH", { maximumFractionDigits: 3 })}
                    <span className="text-xs font-medium text-slate-500 ml-1">{d.unit_abbreviation}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-700">{d.company_name}</td>
                  <td className="px-5 py-3.5 text-slate-600">{d.delivered_by || <span className="text-slate-400">—</span>}</td>
                  <td className="px-5 py-3.5 text-center">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDelivery(d)} className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-900">
                      View
                    </Button>
                  </td>
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

      {/* View Detail Sheet */}
      <Sheet open={!!selectedDelivery} onOpenChange={(o) => { if (!o) setSelectedDelivery(null); }}>
        <SheetContent side="right" className="w-[90vw] sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden border-l border-gray-200 [&>button]:text-white">
          <SheetTitle className="sr-only">Delivery Details</SheetTitle>
          {/* Slate header */}
          <div className="flex items-center gap-3 px-6 py-4 bg-slate-500 rounded-t-lg shrink-0">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Delivery Details</h2>
              <p className="text-xs text-slate-300 mt-0.5 font-mono">{selectedDelivery?.delivery_reference ?? ""}</p>
            </div>
          </div>
          {selectedDelivery && (
            <div className="px-6 py-5 space-y-4 text-sm overflow-y-auto flex-1">
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
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end shrink-0">
            <Button variant="outline" onClick={() => setSelectedDelivery(null)}>Close</Button>
          </div>
        </SheetContent>
      </Sheet>
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
          <DeliveryHistoryTab refreshKey={refreshKey} />
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
