import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getInventoryLogs, submitStockAdjustment } from "@/shared/api/inventoryApi";
import {
    lookupProduct, type ProductRecord,
} from "@/shared/api/productsApi";
import { formatQuantity } from "@/shared/utils/quantityFormat";
import {
    AlertCircle,
    CheckCircle2,
    Clock4,
    Flame,
    Package,
    PackageX,
    RotateCcw,
    ScanLine,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Adjustment type config ───────────────────────────────────────────────────
const ADJUSTMENT_TYPES = [
  { value: "Damaged", label: "Damaged", icon: Flame, color: "text-red-600", bg: "bg-red-50", description: "Items physically damaged, subtract from stock" },
  { value: "Lost", label: "Lost", icon: PackageX, color: "text-orange-600", bg: "bg-orange-50", description: "Items that cannot be located, subtract from stock" },
  { value: "Expired", label: "Expired", icon: Clock4, color: "text-amber-600", bg: "bg-amber-50", description: "Items past expiry date, subtract from stock" },
  { value: "Correction", label: "Correction", icon: RotateCcw, color: "text-blue-600", bg: "bg-blue-50", description: "Manual correction — sets the absolute quantity" },
];

// ─── Type badge helper ──────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const cfg = ADJUSTMENT_TYPES.find((t) => t.value === type) || ADJUSTMENT_TYPES[3];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

// ─── Adjustment Modal ────────────────────────────────────────────────────────────
interface AdjustmentModalProps {
  open: boolean;
  onClose: () => void;
  prefillProduct?: ProductRecord | null;
  onSaved: () => void;
}

// ─── Draft type ───────────────────────────────────────────────────────────────
interface AdjustmentDraft {
  selectedProduct: ProductRecord | null;
  adjType: string;
  qty: string;
  reason: string;
  savedAt: string;
}

function AdjustmentModal({ open, onClose, prefillProduct, onSaved }: AdjustmentModalProps) {
  const [searchInput, setSearchInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(prefillProduct || null);
  const [searchResults, setSearchResults] = useState<ProductRecord[]>([]);
  const [lookupError, setLookupError] = useState("");
  const [adjType, setAdjType] = useState<string>("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // BUG-13 FIX: Remove allProducts state — search via API instead of loading entire catalog
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Draft recovery ────────────────────────────────────────────────────────
  const adjDraft = useDraftRecovery<AdjustmentDraft>(DRAFT_KEYS.CLERK_STOCK_ADJUSTMENT);
  const [recoverableDraft, setRecoverableDraft] = useState<AdjustmentDraft | null>(null);

  useEffect(() => {
    if (open) {
      // Check for a recoverable draft only when the modal first opens
      const draft = adjDraft.getRecoverableDraft();
      if (draft && (draft.selectedProduct || draft.adjType || draft.qty)) {
        setRecoverableDraft(draft);
        // Pre-fill from draft — user will confirm via prompt
        setSelectedProduct(draft.selectedProduct || prefillProduct || null);
        setAdjType(draft.adjType || "");
        setQty(draft.qty || "");
        setReason(draft.reason || "");
      } else {
        setSelectedProduct(prefillProduct || null);
        setAdjType(""); setQty(""); setReason("");
      }
      setErrors({}); setLookupError("");
      setSearchInput(""); setBarcodeInput(""); setSearchResults([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillProduct]);

  // Auto-save draft whenever form fields change
  useEffect(() => {
    if (!open) return;
    if (selectedProduct || adjType || qty) {
      adjDraft.saveDraft({ selectedProduct, adjType, qty, reason, savedAt: new Date().toISOString() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedProduct, adjType, qty, reason]);

  // BUG-13 FIX: Debounced API search instead of filtering allProducts client-side
  useEffect(() => {
    const q = searchInput.trim();
    if (!q) { setSearchResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await lookupProduct(q);
        setSearchResults(results.slice(0, 20) as unknown as ProductRecord[]);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const selectProduct = (p: ProductRecord) => {
    setSelectedProduct(p);
    setSearchInput(""); setSearchResults([]);
    setBarcodeInput(""); setLookupError("");
    setErrors((e) => ({ ...e, product: "" }));
  };

  // Barcode scan — exact match only, via API lookup
  const handleBarcodeScan = useCallback(async (val: string) => {
    if (!val.trim()) return;
    setLookupError("");
    try {
      const results = await lookupProduct(val.trim());
      const exact = results.find((r) => r.barcode === val.trim());
      if (exact) {
        selectProduct(exact as unknown as ProductRecord);
      } else {
        setLookupError("Barcode not registered. Please contact the Administrator.");
      }
    } catch {
      setLookupError("Failed to scan barcode.");
    }
  }, []);

  // Derived new quantity preview
  const qtyNum = parseInt(qty, 10) || 0;
  const currentQty = selectedProduct?.quantity || 0;
  const previewQty = adjType === "Correction"
    ? qtyNum
    : Math.max(0, currentQty - qtyNum);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!selectedProduct) e.product = "Select a product first";
    if (!adjType) e.type = "Select an adjustment type";
    if (!qty || qtyNum < 1) e.qty = "Enter a valid quantity (min 1)";
    if (adjType !== "Correction" && qtyNum > currentQty) {
      e.qty = `Cannot deduct more than current stock (${currentQty})`;
    }
    if (!reason.trim()) e.reason = "Reason is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await submitStockAdjustment({
        product_id: selectedProduct!.id,
        type: adjType as "Damaged" | "Lost" | "Expired" | "Correction",
        quantity: qtyNum,
        reason,
      });
      toast.success(`Adjustment saved — ${selectedProduct!.product_name} updated to ${previewQty} ${selectedProduct!.unit}`);
      // ── Clear draft — adjustment committed to DB ──────────────────────────
      adjDraft.commitDraft();
      onClose();
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to save adjustment:", message.replace(/[\r\n\t]/g, " "));
      toast.error("Failed to save adjustment");
    } finally {
      setLoading(false);
    }
  };

  const typeConfig = ADJUSTMENT_TYPES.find((t) => t.value === adjType);

  return (
    <>
      {/* Draft recovery prompt for stock adjustment */}
      <DraftRecoveryPrompt
        draft={recoverableDraft}
        formLabel="Stock Adjustment"
        savedSummary={
          recoverableDraft
            ? `${recoverableDraft.selectedProduct?.product_name ?? ""}${recoverableDraft.adjType ? ` · ${recoverableDraft.adjType}` : ""}${recoverableDraft.qty ? ` · Qty: ${recoverableDraft.qty}` : ""}${recoverableDraft.savedAt ? ` · Saved: ${new Date(recoverableDraft.savedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
            : undefined
        }
        onRestore={() => setRecoverableDraft(null)}
        onDiscard={() => {
          adjDraft.discardDraft();
          setSelectedProduct(prefillProduct || null);
          setAdjType(""); setQty(""); setReason("");
          setRecoverableDraft(null);
        }}
      />
      <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[92vh] flex flex-col">

          {/* Colored header */}
          <div className="bg-amber-600 px-6 py-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-white/20 rounded-lg">
                <SlidersHorizontal className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Stock Adjustment</h2>
                <p className="text-xs text-amber-100 mt-0.5">Record damaged, lost, expired, or corrected stock</p>
              </div>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-gray-50">

            {/* ── Step 1: Product ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Step 1 — Select Product</p>

              {!selectedProduct ? (
                <div className="space-y-2">
                  <div className="relative">
                    <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 pointer-events-none" />
                    <Input
                      placeholder="Scan barcode then press Enter…"
                      value={barcodeInput}
                      onChange={(e) => { setBarcodeInput(e.target.value); setLookupError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBarcodeScan(barcodeInput); } }}
                      className="pl-9 h-10 font-mono bg-blue-50 border-blue-200 focus:border-blue-400 placeholder:text-blue-400"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span>or search by name</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none z-10" />
                    <Input
                      placeholder="Type product name…"
                      value={searchInput}
                      onChange={(e) => { setSearchInput(e.target.value); setLookupError(""); }}
                      className="pl-9 h-10 border-gray-300"
                      autoComplete="off"
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl z-50 max-h-52 overflow-y-auto">
                        {searchResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => selectProduct(p)}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-amber-50 text-left border-b border-gray-100 last:border-0 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{p.product_name}</p>
                              <p className="text-xs text-gray-400 font-mono">{p.barcode}</p>
                            </div>
                            <span className="ml-3 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                              {formatQuantity(p.quantity, p.unit_abbreviation, p.quantity_type)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {lookupError && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />{lookupError}
                    </div>
                  )}
                  {errors.product && <p className="text-xs text-red-500">{errors.product}</p>}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 p-3 bg-blue-50 border border-blue-300 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded-lg shrink-0"><Package className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{selectedProduct.product_name}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{selectedProduct.barcode} · {selectedProduct.unit}</p>
                      <p className="text-xs mt-1">
                        Current stock: <strong className="text-blue-700 text-sm">{formatQuantity(selectedProduct.quantity, selectedProduct.unit_abbreviation, selectedProduct.quantity_type, selectedProduct.unit_allow_decimal)}</strong>
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                    onClick={() => { setSelectedProduct(null); setErrors({}); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* ── Step 2: Adjustment Type ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Step 2 — Adjustment Type <span className="text-red-500">*</span></p>
              <div className="grid grid-cols-2 gap-2">
                {ADJUSTMENT_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = adjType === t.value;
                  return (
                    <button key={t.value} type="button"
                      onClick={() => { setAdjType(t.value); setErrors((e) => ({ ...e, type: "" })); }}
                      className={`flex items-center gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${
                        active
                          ? `border-current ${t.bg} ${t.color} shadow-sm`
                          : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white text-gray-600"
                      }`}>
                      <Icon className={`h-4 w-4 flex-shrink-0 ${active ? t.color : "text-gray-400"}`} />
                      <span className="text-sm font-semibold">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              {typeConfig && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">{typeConfig.description}</p>
              )}
              {errors.type && <p className="text-xs text-red-500">{errors.type}</p>}
            </div>

            {/* ── Step 3: Quantity + Preview ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Step 3 — Quantity <span className="text-red-500">*</span></p>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {adjType === "Correction" ? "Set New Quantity" : "Quantity to Deduct"}
                </label>
                <Input
                  type="number" min={1}
                  placeholder={adjType === "Correction" ? "Enter exact new quantity" : "How many units?"}
                  value={qty}
                  onChange={(e) => { setQty(e.target.value); setErrors((er) => ({ ...er, qty: "" })); }}
                  className="h-11 text-base border-gray-300 focus:border-amber-400"
                />
                {errors.qty && <p className="text-xs text-red-500 mt-1">{errors.qty}</p>}
              </div>

              {selectedProduct && adjType && qty && qtyNum >= 1 && (
                <div className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 ${
                  previewQty === 0 ? "bg-red-50 border-red-300" :
                  previewQty <= (selectedProduct.reorder_level * 0.5) ? "bg-red-50 border-red-300" :
                  previewQty <= selectedProduct.reorder_level ? "bg-amber-50 border-amber-300" :
                  "bg-green-50 border-green-300"
                }`}>
                  <span className="text-sm font-semibold text-gray-700">New quantity:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 line-through text-sm">{currentQty}</span>
                    <span className="text-gray-400">→</span>
                    <span className={`text-2xl font-bold ${
                      previewQty === 0 ? "text-red-600" :
                      previewQty <= selectedProduct.reorder_level ? "text-amber-700" : "text-green-700"
                    }`}>{previewQty}</span>
                    <span className="text-gray-500 text-sm">{selectedProduct.unit}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Step 4: Reason ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Step 4 — Reason <span className="text-red-500">*</span></p>
              <Textarea
                placeholder="Describe why this adjustment is needed…"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setErrors((er) => ({ ...er, reason: "" })); }}
                className="min-h-[80px] resize-none border-gray-300 focus:border-amber-400"
              />
              {errors.reason && <p className="text-xs text-red-500">{errors.reason}</p>}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex justify-between gap-3 px-6 py-4 bg-white border-t border-gray-200">
            <Button variant="outline" className="border-gray-300 text-gray-700" onClick={onClose}>Cancel</Button>
            <Button
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              onClick={() => { if (validate()) setConfirmOpen(true); }}
              disabled={loading}
            >
              <CheckCircle2 className="h-4 w-4" /> Save Adjustment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Stock Adjustment</AlertDialogTitle>
            <AlertDialogDescription>
              {adjType === "Correction"
                ? `This will set "${selectedProduct?.product_name}" quantity to ${previewQty} ${selectedProduct?.unit}.`
                : `This will deduct ${qtyNum} ${selectedProduct?.unit} from "${selectedProduct?.product_name}" (${currentQty} → ${previewQty}).`
              } This action is logged and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => { setConfirmOpen(false); handleSave(); }}
            >
              {loading ? "Saving..." : "Confirm Adjustment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClerkStockAdjustment() {
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [historySearch, setHistorySearch] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);

  const handleSaved = () => { setModalOpen(false); setRefreshKey((k) => k + 1); };

  // Load adjustment history
  useEffect(() => {
    const fetchLogs = async () => {
      setLoadingLogs(true);
      try {
        const data = await getInventoryLogs();
        const adjustmentLogs = data.filter(log => log.transaction_type === "Adjustment");
        setLogs(adjustmentLogs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to load logs:", message.replace(/[\r\n\t]/g, " "));
        toast.error("Failed to load logs");
      } finally {
        setLoadingLogs(false);
      }
    };
    fetchLogs();
  }, [refreshKey]);

  // Calculate stats
  const totalAdjustments = logs.length;
  const damagedCount = logs.filter(l => l.action === 'Damaged').length;
  const lostCount = logs.filter(l => l.action === 'Lost').length;
  const expiredCount = logs.filter(l => l.action === 'Expired').length;

  // Filtered history
  const filteredHistory = logs.filter((r) =>
    historySearch === "" ||
    (r.product_name || "").toLowerCase().includes(historySearch.toLowerCase()) ||
    (r.barcode || "").toLowerCase().includes(historySearch.toLowerCase()) ||
    (r.action || "").toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Adjustment</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record stock losses due to damage, loss, expiry, or correction</p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="gap-2 bg-amber-600 hover:bg-amber-700 flex-shrink-0">
          <SlidersHorizontal className="h-4 w-4" /> New Adjustment
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Adjustments", value: totalAdjustments, color: "text-gray-900", bg: "bg-gray-50", border: "" },
          { label: "Damaged", value: damagedCount, color: "text-red-600", bg: "bg-red-50", border: "border-red-100" },
          { label: "Lost", value: lostCount, color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-100" },
          { label: "Expired", value: expiredCount, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
        ].map((s) => (
          <Card key={s.label} className={`p-4 text-center ${s.bg} ${s.border}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1 font-medium">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* History table */}
      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b-2 border-gray-200 bg-white flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Adjustment History</h2>
            <p className="text-xs text-gray-500 mt-0.5">All recorded stock adjustments</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 pointer-events-none" />
            <Input
              placeholder="Search adjustments…"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="pl-11 h-11 text-sm border-2 border-gray-300 bg-white rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-y border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide whitespace-nowrap w-16">ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[180px]">Product</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-32">Type</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-32">Deducted / Set</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">Prev. Qty</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-28">New Qty</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide min-w-[200px]">Reason</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs uppercase tracking-wide w-40">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingLogs ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="bg-white">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="py-3.5 px-4"><Skeleton className="h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center bg-white">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-gray-100 rounded-full">
                        <SlidersHorizontal className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="font-semibold text-gray-600">No adjustments found</p>
                      <p className="text-xs text-gray-400">Try adjusting your search or create a new adjustment</p>
                    </div>
                  </td>
                </tr>
              ) : filteredHistory.map((r, idx) => (
                <tr key={r.id} className={`transition-colors hover:bg-amber-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      #{r.id}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-semibold text-gray-900 text-sm leading-tight">{r.product_name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{r.barcode}</p>
                  </td>
                  <td className="py-3.5 px-4"><TypeBadge type={r.action} /></td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-flex items-center justify-center font-bold text-sm px-2.5 py-1 rounded-lg ${
                      r.action === 'Correction'
                        ? 'text-blue-700 bg-blue-50 border border-blue-200'
                        : 'text-red-700 bg-red-50 border border-red-200'
                    }`}>
                      {r.action === 'Correction' ? `→ ${Math.abs(r.quantity_change)}` : `− ${Math.abs(r.quantity_change)}`}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="text-sm font-medium text-gray-500">{r.quantity}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="text-sm font-bold text-gray-900">{r.remaining_stock}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="text-sm text-gray-700 line-clamp-2 max-w-[220px]">{r.reference}</p>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <p className="text-xs font-medium text-gray-700">{new Date(r.created_at).toLocaleDateString()}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AdjustmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
