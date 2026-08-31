import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type {
    Category,
    CreateProductPayload,
    PricingType,
    ProductRecord,
    ProductUsage,
    StockStatus,
    Supplier,
    TaxType,
    Unit,
    UpdateProductPayload,
} from "@/shared/api/productsApi";
import {
    createProduct,
    deleteProduct,
    deriveStatus,
    getCategories,
    getNextBarcode,
    getProducts,
    getSuppliers, getUnits,
    updateProduct,
} from "@/shared/api/productsApi";
import DraftRecoveryPrompt from "@/shared/components/DraftRecoveryPrompt";
import LoadingSpinner from "@/shared/components/LoadingSpinner";
import { useBarcodeScanner } from "@/shared/hooks/useBarcodeScanner";
import { DRAFT_KEYS, useDraftRecovery } from "@/shared/hooks/useDraftRecovery";
import { formatQuantityParts } from "@/shared/utils/quantityFormat";
import axios from "axios";
import { AlertCircle, Edit2, Eye, Package, Plus, RefreshCw, ScanLine, Search, Trash2, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractErrors(err: unknown): Record<string, string> {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data;
    if (body?.errors && Array.isArray(body.errors)) {
      const map: Record<string, string> = {};
      for (const e of body.errors as { field: string; message: string }[]) {
        map[e.field] = e.message;
      }
      return map;
    }
    if (body?.message) return { general: body.message };
  }
  return { general: "An unexpected error occurred. Please try again." };
}

function statusBadge(status: StockStatus) {
  const styles =
    status === "In Stock"  ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
    status === "Low Stock" ? "bg-amber-100 text-amber-700 border border-amber-200"       :
    status === "Critical"  ? "bg-orange-100 text-orange-700 border border-orange-200"   :
                             "bg-red-100 text-red-700 border border-red-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${styles}`}>
      {status}
    </span>
  );
}

// ─── Form types ───────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    barcode:          "",
    barcode_source:   "manufacturer" as "manufacturer" | "store",
    supplier_barcode: "",
    product_name:     "",
    description:      "",
    category_id:      "" as unknown as number,
    supplier_id:      "" as unknown as number | null,
    unit_id:          "" as unknown as number,
    cost_price:       "" as unknown as number,
    selling_price:    "" as unknown as number,
    reorder_level:    "" as unknown as number,
    is_returnable:    true,
    status:           "Active" as "Active" | "Inactive",
    tax_type:         "VATABLE" as TaxType,
    pricing_type:     "FIXED_PRICE" as PricingType,
    product_usage:    "RETAIL_PRODUCT" as ProductUsage,
  };
}
type ProductForm = ReturnType<typeof emptyForm>;

function formFromRecord(p: ProductRecord): ProductForm {
  return {
    barcode:          p.barcode,
    barcode_source:   p.barcode_source ?? "manufacturer",
    supplier_barcode: p.supplier_barcode ?? "",
    product_name:     p.product_name,
    description:      p.description ?? "",
    category_id:      p.category_id ?? ("" as unknown as number),
    supplier_id:      p.supplier_id ?? ("" as unknown as number | null),
    unit_id:          p.unit_id ?? ("" as unknown as number),
    cost_price:       p.cost_price,
    selling_price:    p.selling_price,
    reorder_level:    p.reorder_level,
    is_returnable:    Boolean(p.is_returnable),
    status:           p.status,
    tax_type:         (p.tax_type ?? "VATABLE") as TaxType,
    pricing_type:     (p.pricing_type ?? "FIXED_PRICE") as PricingType,
    product_usage:    (p.product_usage ?? "RETAIL_PRODUCT") as ProductUsage,
  };
}

function validateForm(form: ProductForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!form.barcode.trim())      e.barcode       = "Barcode is required.";
  if (!form.product_name.trim()) e.product_name  = "Product name is required.";
  if (!form.category_id)         e.category_id   = "Category is required.";
  if (!form.unit_id)             e.unit_id       = "Unit is required.";
  if (form.pricing_type === "FIXED_PRICE") {
    if (form.cost_price === "" as unknown as number || Number(form.cost_price) < 0)
                                 e.cost_price    = "Cost price must be 0 or greater.";
    if (form.selling_price === "" as unknown as number || Number(form.selling_price) < 0)
                                 e.selling_price = "Selling price must be 0 or greater.";
    if (form.reorder_level === "" as unknown as number || Number(form.reorder_level) < 0)
                                 e.reorder_level = "Reorder level must be 0 or greater.";
  } else {
    // MARKET_BASED: reorder level is optional
    if (form.reorder_level !== ("" as unknown as number) && Number(form.reorder_level) < 0)
                                 e.reorder_level = "Reorder level must be 0 or greater.";
  }
  return e;
}

// ─── ProductFormModal ─────────────────────────────────────────────────────────

interface ProductFormModalProps {
  mode: "add" | "edit";
  open: boolean;
  initial?: ProductRecord | null;
  categories: Category[];
  suppliers: Supplier[];
  units: Unit[];
  onClose: () => void;
  onSaved: (product: ProductRecord) => void;
}

function ProductFormModal({ mode, open, initial, categories, suppliers, units, onClose, onSaved }: ProductFormModalProps) {
  const [form,           setForm]           = useState<ProductForm>(emptyForm());
  const [errors,         setErrors]         = useState<Record<string, string>>({});
  const [isLoading,      setIsLoading]      = useState(false);
  const [generatingBC,   setGeneratingBC]   = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // ── Draft recovery (only for "add" mode — edit has the DB record as fallback) ──
  const draftKey = mode === "add" ? DRAFT_KEYS.ADMIN_PRODUCT_ADD : DRAFT_KEYS.ADMIN_PRODUCT_EDIT;
  const productDraft = useDraftRecovery<{ form: ProductForm; savedAt: string }>(draftKey);
  const [recoverableDraft, setRecoverableDraft] = useState<{ form: ProductForm; savedAt: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setForm(formFromRecord(initial));
      setRecoverableDraft(null);
    } else if (mode === "add") {
      // Check for a recoverable draft before resetting to empty
      const draft = productDraft.getRecoverableDraft();
      if (draft?.form && draft.form.product_name) {
        // Pre-fill with draft and show recovery prompt
        setForm(draft.form);
        setRecoverableDraft(draft);
      } else {
        setForm(emptyForm());
        setRecoverableDraft(null);
      }
    }
    setErrors({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  // Auto-save form draft on every field change (add mode only)
  useEffect(() => {
    if (!open || mode !== "add") return;
    // Only save if the user has typed something meaningful
    if (form.product_name || form.barcode) {
      productDraft.saveDraft({ form, savedAt: new Date().toISOString() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  const set = (key: keyof ProductForm, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSourceChange = (source: "manufacturer" | "store") => {
    setForm((prev) => ({ ...prev, barcode_source: source, barcode: "" }));
    setErrors((prev) => ({ ...prev, barcode: "" }));
  };

  const handleGenerateBarcode = async () => {
    setGeneratingBC(true);
    try {
      const bc = await getNextBarcode();
      setForm((prev) => ({ ...prev, barcode: bc }));
    } catch {
      setErrors((prev) => ({ ...prev, barcode: "Failed to generate barcode. Try again." }));
    } finally {
      setGeneratingBC(false);
    }
  };

  const handleScanClick = () => {
    barcodeInputRef.current?.focus();
    barcodeInputRef.current?.select();
  };

  const isStore = form.barcode_source === "store";

  const modalScanner = useBarcodeScanner({
    setValue: (val) => set("barcode", val.replace(/\s/g, "")),
    onScan: (val) => set("barcode", val.replace(/\s/g, "")),
    inputRef: barcodeInputRef,
    enabled: !isStore,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientErrors = validateForm(form);
    if (Object.keys(clientErrors).length > 0) { setErrors(clientErrors); return; }
    setErrors({});
    setIsLoading(true);
    try {
      const isMarket = form.pricing_type === "MARKET_BASED";
      const payload: CreateProductPayload = {
        barcode:          form.barcode.trim(),
        barcode_source:   form.barcode_source,
        supplier_barcode: form.supplier_barcode?.trim() || null,
        product_name:     form.product_name.trim(),
        description:      form.description?.trim() || null,
        category_id:      Number(form.category_id),
        supplier_id:      form.supplier_id ? Number(form.supplier_id) : null,
        unit_id:          Number(form.unit_id),
        // cost_price and selling_price are omitted for MARKET_BASED; backend forces them to 0
        ...(isMarket ? {} : {
          cost_price:    Number(form.cost_price),
          selling_price: Number(form.selling_price),
        }),
        reorder_level:    Number(form.reorder_level) || 0,
        is_returnable:    form.is_returnable,
        status:           form.status,
        tax_type:         form.tax_type,
        pricing_type:     form.pricing_type,
        product_usage:    form.product_usage,
      };
      const saved = mode === "add"
        ? await createProduct(payload)
        : await updateProduct(initial!.id, payload as UpdateProductPayload);
      // ── Clear draft — product committed to DB ─────────────────────────────
      productDraft.commitDraft();
      onSaved(saved);
      onClose();
    } catch (err) {
      setErrors(extractErrors(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Draft recovery prompt — add mode only */}
      {mode === "add" && (
        <DraftRecoveryPrompt
          draft={recoverableDraft}
          formLabel="Add Product"
          savedSummary={
            recoverableDraft
              ? `${recoverableDraft.form.product_name || "Untitled"}${recoverableDraft.form.barcode ? ` · ${recoverableDraft.form.barcode}` : ""}${recoverableDraft.savedAt ? ` · Saved: ${new Date(recoverableDraft.savedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
              : undefined
          }
          onRestore={() => setRecoverableDraft(null)}
          onDiscard={() => {
            productDraft.discardDraft();
            setForm(emptyForm());
            setRecoverableDraft(null);
          }}
        />
      )}
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-3xl p-0 flex flex-col gap-0 overflow-hidden border-l border-gray-200 [&>button]:text-white">
        <SheetTitle className="sr-only">{mode === "add" ? "Add New Product" : "Edit Product"}</SheetTitle>

        {/* Colored header */}
        <div className={`flex items-center gap-3 px-6 py-4 rounded-t-lg shrink-0 ${mode === "add" ? "bg-blue-400" : "bg-gray-500"}`}>
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              {mode === "add" ? "Add New Product" : "Edit Product"}
            </h2>
            <p className={`text-xs mt-0.5 ${mode === "add" ? "text-blue-100" : "text-gray-300"}`}>
              {mode === "add"
                ? "Fill in the details below to add a new product to your catalog."
                : "Update the product information below."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-5 space-y-6 overflow-y-auto flex-1">
            {errors.general && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700">{errors.general}</p>
              </div>
            )}

          {/* ════════════════════════════════════════════════════════════════
             SECTION 1 — Classification
             ════════════════════════════════════════════════════════════════ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-5 w-1.5 bg-blue-600 rounded-full shadow-sm" />
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Classification</h3>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Pricing Type</Label>
                  <Select
                    value={form.pricing_type}
                    onValueChange={(v) => {
                      set("pricing_type", v as PricingType);
                      if (v === "MARKET_BASED") {
                        if (form.product_usage === "RETAIL_PRODUCT") {
                          set("product_usage", "RAW_MATERIAL_COMMODITY" as ProductUsage);
                        }
                        set("barcode_source", "store" as "manufacturer" | "store");
                        set("barcode", "");
                      }
                    }}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="w-full bg-white border-gray-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="FIXED_PRICE">Fixed Price</SelectItem>
                      <SelectItem value="MARKET_BASED">Market-Based</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.pricing_type === "MARKET_BASED" && (
                    <p className="mt-1 text-xs text-amber-600">
                      Uses configurable reference buying price managed under Commodity Prices.
                    </p>
                  )}
                </div>
                {form.pricing_type === "MARKET_BASED" && (
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Product Usage</Label>
                    <Select
                      value={form.product_usage}
                      onValueChange={(v) => set("product_usage", v as ProductUsage)}
                      disabled={isLoading}
                    >
                      <SelectTrigger className="w-full bg-white border-gray-300">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="RAW_MATERIAL_COMMODITY">Raw Material / Commodity</SelectItem>
                        <SelectItem value="BOTH">Both — retail & raw material</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.product_usage === "RAW_MATERIAL_COMMODITY" && (
                      <p className="mt-1 text-xs text-gray-400">
                        RAW_MATERIAL_COMMODITY = eligible for external processing delivery.
                      </p>
                    )}
                    {form.product_usage === "BOTH" && (
                      <p className="mt-1 text-xs text-gray-400">
                        BOTH = eligible for external processing delivery and available for retail.
                      </p>
                    )}
                  </div>
                )}
                {form.pricing_type !== "MARKET_BASED" && <div />}
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tax Classification</Label>
                <Select
                  value={form.tax_type}
                  onValueChange={(v) => set("tax_type", v as TaxType)}
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-full max-w-xs bg-white border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="VATABLE">VATABLE (12% VAT)</SelectItem>
                    <SelectItem value="VAT_EXEMPT">VAT Exempt</SelectItem>
                    <SelectItem value="ZERO_RATED">Zero-Rated</SelectItem>
                    <SelectItem value="NON_TAXABLE">Non-Taxable</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-amber-600">Confirm classification with your accountant before changing from VATABLE.</p>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
             SECTION 2 — Barcode & Identification
             ════════════════════════════════════════════════════════════════ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-5 w-1.5 bg-blue-600 rounded-full shadow-sm" />
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Barcode & Identification</h3>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
              {/* Row 1 — Barcode Source toggle */}
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Barcode Source <span className="text-red-500">*</span></Label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit bg-white">
                  {(["manufacturer", "store"] as const).map((src, i) => (
                    <label key={src}
                      className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium cursor-pointer select-none transition-colors ${
                        i === 0 ? "" : "border-l border-gray-300"
                      } ${
                        form.barcode_source === src
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      } ${isLoading || mode === "edit" ? "pointer-events-none opacity-60" : ""}`}>
                      <input type="radio" name="barcode_source" value={src}
                        checked={form.barcode_source === src}
                        onChange={() => handleSourceChange(src)}
                        className="sr-only" disabled={isLoading || mode === "edit"} />
                      {src === "manufacturer" ? "Manufacturer Barcode" : "Store Barcode (Auto-Generate)"}
                    </label>
                  ))}
                </div>
              </div>

              {/* Row 2 — Barcode (full width) */}
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Barcode <span className="text-red-500">*</span></Label>
                {isStore ? (
                  <div className="flex gap-2">
                    <Input value={form.barcode} readOnly placeholder="Click Generate to assign a store barcode"
                      className={`bg-gray-100 flex-1 ${errors.barcode ? "border-red-400" : "border-gray-300"}`} />
                    <Button type="button" variant="outline" onClick={handleGenerateBarcode}
                      disabled={isLoading || generatingBC} className="shrink-0 gap-2 border-gray-300">
                      {generatingBC ? <LoadingSpinner size={16} className="text-gray-500" /> : <Wand2 className="h-4 w-4" />}
                      Generate
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input ref={barcodeInputRef} value={form.barcode}
                      onChange={(e) => set("barcode", e.target.value.replace(/\s/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key === " ") e.preventDefault();
                        modalScanner.handleKeyDown(e);
                      }}
                      onFocus={modalScanner.handleFocus}
                      placeholder="Scan or enter manufacturer barcode"
                      disabled={isLoading}
                      className={`flex-1 ${errors.barcode ? "border-red-400" : "border-gray-300"}`} />
                    <Button type="button" variant="outline" onClick={handleScanClick}
                      disabled={isLoading} className="shrink-0 gap-2 border-gray-300" title="Click then scan with USB scanner">
                      <ScanLine className="h-4 w-4" /> Scan
                    </Button>
                  </div>
                )}
                {errors.barcode && <p className="mt-1 text-xs text-red-600">{errors.barcode}</p>}
                <p className="mt-1 text-xs text-gray-400">
                  {isStore ? "A unique store barcode will be auto-generated." : "Scan with a USB barcode scanner or type manually."}
                </p>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
             SECTION 3 — Product Details
             ════════════════════════════════════════════════════════════════ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-5 w-1.5 bg-blue-600 rounded-full shadow-sm" />
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Product Details</h3>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Product Name <span className="text-red-500">*</span></Label>
                <Input value={form.product_name} onChange={(e) => set("product_name", e.target.value)}
                  placeholder="e.g. Claw Hammer 16oz" disabled={isLoading}
                  className={errors.product_name ? "border-red-400" : ""} />
                {errors.product_name && <p className="mt-1 text-xs text-red-600">{errors.product_name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Category <span className="text-red-500">*</span></Label>
                  <Select value={form.category_id ? String(form.category_id) : ""}
                    onValueChange={(v) => set("category_id", v)} disabled={isLoading}>
                    <SelectTrigger className={`w-full bg-white ${errors.category_id ? "border-red-400" : "border-gray-300"}`}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.category_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.category_id && <p className="mt-1 text-xs text-red-600">{errors.category_id}</p>}
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Supplier <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Select value={form.supplier_id ? String(form.supplier_id) : "none"}
                    onValueChange={(v) => set("supplier_id", v === "none" ? null : v)} disabled={isLoading}>
                    <SelectTrigger className="w-full bg-white border-gray-300"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="none">— No supplier —</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.supplier_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Unit <span className="text-red-500">*</span></Label>
                  <Select value={form.unit_id ? String(form.unit_id) : ""}
                    onValueChange={(v) => set("unit_id", v)} disabled={isLoading}>
                    <SelectTrigger className={`w-full bg-white ${errors.unit_id ? "border-red-400" : "border-gray-300"}`}>
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {units.filter((u) => u.status === "Active").map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.unit_name} ({u.abbreviation})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.unit_id && <p className="mt-1 text-xs text-red-600">{errors.unit_id}</p>}
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    Reorder Level
                    {form.pricing_type === "MARKET_BASED" ? (
                      <span className="text-gray-400 font-normal"> (optional)</span>
                    ) : (
                      <span className="text-red-500"> *</span>
                    )}
                  </Label>
                  <Input type="number" min="0" value={form.reorder_level}
                    onChange={(e) => set("reorder_level", e.target.value)}
                    placeholder={form.pricing_type === "MARKET_BASED" ? "e.g. 30 (optional)" : "e.g. 20"}
                    disabled={isLoading}
                    className={errors.reorder_level ? "border-red-400" : ""} />
                  {errors.reorder_level && <p className="mt-1 text-xs text-red-600">{errors.reorder_level}</p>}
                  {form.pricing_type === "MARKET_BASED" && (
                    <p className="mt-1 text-xs text-gray-400">Optional for market-based products.</p>
                  )}
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Description <span className="text-gray-400 font-normal">(optional)</span></Label>
                <textarea value={form.description} onChange={(e) => set("description", e.target.value)}
                  rows={2} disabled={isLoading} placeholder="Additional product details…"
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 bg-white" />
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
             SECTION 4 — Pricing & Stock
             ════════════════════════════════════════════════════════════════ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-5 w-1.5 bg-blue-600 rounded-full shadow-sm" />
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Pricing & Stock</h3>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm p-4 space-y-4">

              {form.pricing_type === "MARKET_BASED" ? (
                /* ── MARKET_BASED: no cost/selling price ── */
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-amber-500 text-lg leading-none mt-0.5">⚠️</span>
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800">Market-Based Product — No Fixed Price Required</p>
                    <p className="text-amber-700 mt-1">
                      Cost Price and Selling Price are not used for this product.
                      The reference buying price is managed separately through the
                      <span className="font-semibold"> Commodity Prices</span> module by the Admin.
                    </p>
                  </div>
                </div>
              ) : (
                /* ── FIXED_PRICE: normal cost/selling price fields ── */
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cost Price (₱) <span className="text-red-500">*</span></Label>
                    <Input type="number" min="0" step="0.01" value={form.cost_price}
                      onChange={(e) => set("cost_price", e.target.value)}
                      placeholder="0.00" disabled={isLoading}
                      className={errors.cost_price ? "border-red-400" : "border-gray-300"} />
                    {errors.cost_price && <p className="mt-1 text-xs text-red-600">{errors.cost_price}</p>}
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Selling Price (₱) <span className="text-red-500">*</span></Label>
                    <Input type="number" min="0" step="0.01" value={form.selling_price}
                      onChange={(e) => set("selling_price", e.target.value)}
                      placeholder="0.00" disabled={isLoading}
                      className={errors.selling_price ? "border-red-400" : "border-gray-300"} />
                    {errors.selling_price && <p className="mt-1 text-xs text-red-600">{errors.selling_price}</p>}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={form.is_returnable}
                    onChange={(e) => set("is_returnable", e.target.checked)}
                    className="h-4 w-4 accent-blue-600 rounded" disabled={isLoading} />
                  <span className="text-gray-700">Returnable</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={form.status === "Active"}
                    onChange={(e) => set("status", e.target.checked ? "Active" : "Inactive")}
                    className="h-4 w-4 accent-blue-600 rounded" disabled={isLoading} />
                  <span className="text-gray-700">Active</span>
                </label>
              </div>
            </div>
          </div>
          </div>{/* end scrollable body */}

        {/* Sticky footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading} className="px-5">
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} className={`px-6 gap-2 ${mode === "add" ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-800 hover:bg-gray-900"}`}>
            {isLoading && <LoadingSpinner size={16} className="text-white" />}
            {isLoading
              ? (mode === "add" ? "Adding…" : "Saving…")
              : (mode === "add" ? "Add Product" : "Save Changes")}
          </Button>
        </div>
        </form>
      </SheetContent>
    </Sheet>
    </>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────

interface ViewProductModalProps {
  product: ProductRecord | null;
  onClose: () => void;
  onEdit: (p: ProductRecord) => void;
}

function ViewProductModal({ product, onClose, onEdit }: ViewProductModalProps) {
  if (!product) return null;
  const status = deriveStatus(product.quantity, product.reorder_level);
  return (
    <Sheet open={!!product} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-2xl p-0 flex flex-col gap-0 overflow-hidden border-l border-gray-200 [&>button]:text-white">
        <SheetTitle className="sr-only">Product Details - {product.product_name}</SheetTitle>
        {/* Slate header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-slate-700 rounded-t-lg shrink-0">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white truncate">{product.product_name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-xs text-slate-300">{product.barcode}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                product.barcode_source === "store"
                  ? "bg-purple-400/30 text-purple-100"
                  : "bg-blue-400/30 text-blue-100"
              }`}>
                {product.barcode_source === "store" ? "Store" : "Manufacturer"}
              </span>
            </div>
          </div>
          {statusBadge(status)}
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Core info grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div><span className="text-xs text-gray-500 block mb-0.5">Category</span><span className="font-medium text-gray-900">{product.category || "—"}</span></div>
            <div><span className="text-xs text-gray-500 block mb-0.5">Supplier</span><span className="font-medium text-gray-900">{product.supplier || "—"}</span></div>
            <div><span className="text-xs text-gray-500 block mb-0.5">Unit</span><span className="font-medium text-gray-900">{product.unit} ({product.unit_abbreviation})</span></div>
            <div><span className="text-xs text-gray-500 block mb-0.5">Reorder Level</span><span className="font-medium text-gray-900">{product.reorder_level}</span></div>
            <div>
              <span className="text-xs text-gray-500 block mb-0.5">Cost Price</span>
              <span className="font-medium text-gray-900">
                {product.pricing_type === "MARKET_BASED"
                  ? <span className="text-amber-600 text-xs font-medium">Via Commodity Prices</span>
                  : `₱${Number(product.cost_price).toFixed(2)}`}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-500 block mb-0.5">Selling Price</span>
              <span className="font-semibold text-gray-900">
                {product.pricing_type === "MARKET_BASED"
                  ? <span className="text-amber-600 text-xs font-medium">Via Commodity Prices</span>
                  : `₱${Number(product.selling_price).toFixed(2)}`}
              </span>
            </div>
          </div>

          {/* Stock + flags */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">Stock</p>
              {(() => {
                const parts = formatQuantityParts(product.quantity, product.unit_abbreviation, product.quantity_type, product.unit_allow_decimal);
                return (
                  <p className={`text-xl font-bold tabular-nums ${
                    product.quantity === 0 ? "text-red-600" :
                    product.quantity <= product.reorder_level ? "text-amber-600" : "text-gray-900"
                  }`}>
                    {parts.number}
                    {parts.unit && <span className="text-xs text-gray-500 ml-0.5">{parts.unit}</span>}
                  </p>
                );
              })()}
            </div>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">Damaged</p>
              <p className={`text-xl font-bold tabular-nums ${product.damaged_stock > 0 ? "text-red-500" : "text-gray-300"}`}>
                {product.damaged_stock}
              </p>
            </div>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
              <p className="text-xs text-gray-500 mb-1">Returnable</p>
              <p className={`text-sm font-bold mt-1 ${product.is_returnable ? "text-emerald-600" : "text-gray-400"}`}>
                {product.is_returnable ? "Yes" : "No"}
              </p>
            </div>
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`px-2 py-1 rounded-full font-medium border ${
              product.status === "Active"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-gray-100 text-gray-500 border-gray-200"
            }`}>{product.status}</span>
            <span className="px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600 border border-gray-200">
              {product.tax_type ?? "VATABLE"}
            </span>
            <span className={`px-2 py-1 rounded-full font-medium border ${
              product.pricing_type === "MARKET_BASED"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}>
              {product.pricing_type === "MARKET_BASED" ? "Market-Based" : "Fixed Price"}
            </span>
          </div>

          {product.description && (
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm">
              <p className="text-xs text-gray-500 font-medium mb-1">Description</p>
              <p className="text-gray-700">{product.description}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { onClose(); onEdit(product); }}>
              <Edit2 className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

interface DeleteDialogProps {
  product: ProductRecord | null;
  onClose: () => void;
  onDeleted: (id: number, soft: boolean) => void;
}

function DeleteDialog({ product, onClose, onDeleted }: DeleteDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => { if (product) setError(null); }, [product]);

  const handleConfirm = async () => {
    if (!product) return;
    setIsLoading(true);
    try {
      const result = await deleteProduct(product.id);
      onDeleted(product.id, result.soft);
      onClose();
    } catch (err) {
      setError(extractErrors(err).general ?? "Failed to remove product.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm p-0 flex flex-col gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Remove Product</DialogTitle>
        {/* Red header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-600 rounded-t-lg">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Trash2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Remove Product</h2>
            <p className="text-xs text-red-100 mt-0.5">This action cannot be undone</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Product info card */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="font-semibold text-gray-900 text-sm">{product?.product_name}</p>
            <p className="font-mono text-xs text-gray-500 mt-0.5">{product?.barcode}</p>
          </div>
          <p className="text-sm text-gray-700">
            If this product has sales history it will be <strong>deactivated</strong> instead of permanently deleted.
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
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            {isLoading && <LoadingSpinner size={16} className="text-white" />}
            {isLoading ? "Removing…" : "Remove"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Products Page ───────────────────────────────────────────────────────

export default function Products() {
  const [products,   setProducts]   = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [units,      setUnits]      = useState<Unit[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [loadError,  setLoadError]  = useState<string | null>(null);

  const [search,       setSearch]       = useState("");
  const [filterCat,    setFilterCat]    = useState("");
  const [filterSup,    setFilterSup]    = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showAdd,      setShowAdd]      = useState(false);
  const [editTarget,   setEditTarget]   = useState<ProductRecord | null>(null);
  const [viewTarget,   setViewTarget]   = useState<ProductRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRecord | null>(null);

  const [bannerToast, setBannerToast] = useState<{ msg: string; type: "success" | "info" } | null>(null);
  const showToast = (msg: string, type: "success" | "info" = "success") => {
    setBannerToast({ msg, type });
    setTimeout(() => setBannerToast(null), 3500);
  };

  // Load reference data
  useEffect(() => {
    Promise.all([getCategories(), getSuppliers(), getUnits()])
      .then(([cats, sups, uns]) => {
        setCategories(cats);
        setSuppliers(sups);
        setUnits(uns);
      })
      .catch(() => {});
  }, []);

  const loadProducts = useCallback(async (searchVal: string) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getProducts({
        search:      searchVal || undefined,
        category_id: filterCat    || undefined,
        supplier_id: filterSup    || undefined,
        status:      filterStatus as StockStatus | "" || undefined,
      });
      setProducts(data);
    } catch (err) {
      setLoadError(extractErrors(err).general ?? "Failed to load products.");
    } finally {
      setIsLoading(false);
    }
  }, [filterCat, filterSup, filterStatus]);

  useEffect(() => { loadProducts(search); }, [filterCat, filterSup, filterStatus, loadProducts]);

  // Real-time zero-refresh sync: refresh products list on sales, stock-ins, or product updates
  useRealtimeSync(["products", "inventory", "sales", "returns"], () => {
    loadProducts(search);
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleBarcodeScan = useCallback((barcode: string) => {
    setSearch(barcode);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    loadProducts(barcode);
  }, [loadProducts]);

  const { handleKeyDown: handleSearchKeyDown, handleFocus: handleSearchFocus } = useBarcodeScanner({
    setValue: (val) => {
      setSearch(val);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => loadProducts(val), 350);
    },
    onScan: handleBarcodeScan,
    inputRef: searchInputRef,
    enableGlobalScan: !showAdd && !editTarget && !viewTarget && !deleteTarget,
  });

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => loadProducts(val), 350);
  };

  const handleSaved = (product: ProductRecord) => {
    setProducts((prev) => {
      const exists = prev.find((p) => p.id === product.id);
      return exists ? prev.map((p) => p.id === product.id ? product : p) : [product, ...prev];
    });
    showToast(`${product.product_name} saved successfully.`);
  };

  const handleDeleted = (id: number, soft: boolean) => {
    if (soft) {
      setProducts((prev) => prev.map((p) => p.id === id ? { ...p, status: "Inactive" as const } : p));
      showToast("Product deactivated (has sales history).", "info");
    } else {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      showToast("Product deleted.", "info");
    }
  };

  const clearFilters = () => { setSearch(""); setFilterCat(""); setFilterSup(""); setFilterStatus(""); };
  const hasFilters = search || filterCat || filterSup || filterStatus;

  return (
    <div className="space-y-5">
      {/* Toast */}
      {bannerToast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border
          ${bannerToast.type === "success"
            ? "bg-emerald-600 text-white border-emerald-700"
            : "bg-blue-600 text-white border-blue-700"}`}>
          {bannerToast.msg}
          <button onClick={() => setBannerToast(null)} className="ml-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your product catalog</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-gray-300 text-gray-600 hover:bg-gray-100"
            onClick={() => loadProducts(search)} disabled={isLoading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm shadow-sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {loadError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 font-semibold">Failed to load products</p>
            <p className="text-sm text-red-600 mt-0.5">{loadError}</p>
          </div>
          <button onClick={() => loadProducts(search)} className="text-red-600 hover:text-red-800 text-sm font-semibold">Retry</button>
          <button onClick={() => setLoadError(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-4.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Search */}
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 hover:border-slate-400 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-xs">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={handleSearchFocus}
              placeholder="Search name or barcode…"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400 min-w-0 text-slate-800 font-medium"
            />
            {search && (
              <button onClick={() => handleSearchChange("")} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* Category */}
          <Select value={filterCat || "all"} onValueChange={(v) => setFilterCat(v === "all" ? "" : v)}>
            <SelectTrigger className="bg-white border-slate-300 hover:border-slate-400 text-slate-800 h-10 shadow-xs">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.category_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Supplier */}
          <Select value={filterSup || "all"} onValueChange={(v) => setFilterSup(v === "all" ? "" : v)}>
            <SelectTrigger className="bg-white border-slate-300 hover:border-slate-400 text-slate-800 h-10 shadow-xs">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.supplier_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Status */}
          <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="bg-white border-slate-300 hover:border-slate-400 text-slate-800 h-10 shadow-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="In Stock">In Stock</SelectItem>
              <SelectItem value="Low Stock">Low Stock</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
              <SelectItem value="Out of Stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <div className="mt-3 flex items-center gap-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500 font-medium">{products.length} result{products.length !== 1 ? "s" : ""} found</span>
            <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline">
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Barcode</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Product Name</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Category</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide">Supplier</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-right">Cost Price</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-right">Selling Price</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Stock</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Reorder</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Status</th>
                <th className="py-3.5 px-5 font-bold text-slate-700 text-xs uppercase tracking-wide text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-16" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-16" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-12" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-12" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                        <Package className="h-7 w-7 text-slate-400" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">No products found</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {hasFilters ? "Try adjusting your filters" : "Click Add Product to get started"}
                        </p>
                      </div>
                      {hasFilters ? (
                        <button onClick={clearFilters} className="text-blue-600 text-sm font-bold hover:underline cursor-pointer">
                          Clear filters
                        </button>
                      ) : (
                        <button onClick={() => setShowAdd(true)} className="text-blue-600 text-sm font-bold hover:underline cursor-pointer">
                          Add your first product
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const stockStatus = deriveStatus(product.quantity, product.reorder_level);
                  const inactive = product.status === "Inactive";
                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-blue-50/50 transition-colors ${inactive ? "opacity-50" : ""}`}
                    >
                      <td className="py-3.5 px-5">
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">
                          {product.barcode}
                        </span>
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-bold text-slate-900 text-sm">{product.product_name}</p>
                        {inactive && (
                          <span className="text-xs text-slate-400 font-medium">Inactive</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        {product.category ? (
                          <span className="inline-flex items-center text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md whitespace-nowrap">
                            {product.category}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-sm text-slate-600 font-medium">{product.supplier || "—"}</td>
                      <td className="py-3.5 px-5 text-right text-sm font-mono text-slate-600">₱{Number(product.cost_price).toFixed(2)}</td>
                      <td className="py-3.5 px-5 text-right">
                        <span className="text-sm font-bold font-mono text-slate-900">₱{Number(product.selling_price).toFixed(2)}</span>
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        {(() => {
                          const parts = formatQuantityParts(product.quantity, product.unit_abbreviation, product.quantity_type, product.unit_allow_decimal);
                          return (
                            <div className="flex items-center justify-center gap-0.5 font-mono">
                              <span className={`text-base font-bold tabular-nums ${
                                product.quantity === 0 ? "text-red-600" :
                                product.quantity <= product.reorder_level ? "text-amber-600" :
                                "text-slate-900"}`}>
                                {parts.number}
                              </span>
                              {parts.unit && <span className="text-xs text-slate-500 font-sans font-medium">{parts.unit}</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3.5 px-5 text-center text-sm font-mono text-slate-500">{product.reorder_level}</td>
                      <td className="py-3.5 px-5 text-center">{statusBadge(stockStatus)}</td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            title="View"
                            onClick={() => setViewTarget(product)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            title="Edit"
                            onClick={() => setEditTarget(product)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            title="Remove"
                            onClick={() => setDeleteTarget(product)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && products.length > 0 && (
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-600 font-bold">
              {products.length} product{products.length !== 1 ? "s" : ""} in catalog
            </p>
            <p className="text-xs text-slate-400 font-medium">Isra Hardware POS</p>
          </div>
        )}
      </div>

      <ProductFormModal mode="add" open={showAdd} categories={categories} suppliers={suppliers} units={units}
        onClose={() => setShowAdd(false)} onSaved={handleSaved} />
      <ProductFormModal mode="edit" open={!!editTarget} initial={editTarget} categories={categories}
        suppliers={suppliers} units={units} onClose={() => setEditTarget(null)} onSaved={handleSaved} />
      <ViewProductModal product={viewTarget} onClose={() => setViewTarget(null)} onEdit={(p) => setEditTarget(p)} />
      <DeleteDialog product={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
    </div>
  );
}
