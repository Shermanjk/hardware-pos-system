import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Sheet, SheetContent, SheetTitle
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getInventoryLogs, submitStockAdjustment } from "@/shared/api/inventoryApi";
import {
    lookupProduct, type ProductRecord,
} from "@/shared/api/productsApi";
import DraftRecoveryPrompt from "@/shared/components/DraftRecoveryPrompt";
import { useBarcodeScanner } from "@/shared/hooks/useBarcodeScanner";
import { DRAFT_KEYS, useDraftRecovery } from "@/shared/hooks/useDraftRecovery";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";
import { formatQuantity } from "@/shared/utils/quantityFormat";
import ClerkAuthModal from "../components/ClerkAuthModal";
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
  const normType = (type || "").toLowerCase();
  let label = "Correction";
  let Icon = RotateCcw;
  let style = "bg-blue-50 text-blue-700 border-blue-200";

  if (normType.includes("damag")) {
    label = "Damaged";
    Icon = Flame;
    style = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (normType.includes("lost") || normType.includes("loss")) {
    label = "Lost";
    Icon = PackageX;
    style = "bg-orange-50 text-orange-700 border-orange-200";
  } else if (normType.includes("expir")) {
    label = "Expired";
    Icon = Clock4;
    style = "bg-amber-50 text-amber-700 border-amber-200";
  } else if (normType.includes("miscount") || normType.includes("count") || normType.includes("adjust") || normType.includes("correct")) {
    label = "Correction";
    Icon = RotateCcw;
    style = "bg-blue-50 text-blue-700 border-blue-200";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      <Icon className="h-3 w-3" />{label}
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
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authRequestType, setAuthRequestType] = useState<"market_adjustment" | "stock_count_standard">("stock_count_standard");
  const [authPayload, setAuthPayload] = useState<any>(null);
  const [authSummary, setAuthSummary] = useState<{ label: string; value: string }[]>([]);

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

  const barcodeInputRef = useRef<HTMLInputElement>(null);

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

  const { handleKeyDown: handleBarcodeKeyDown, handleFocus: handleBarcodeFocus } = useBarcodeScanner({
    setValue: (val) => { setBarcodeInput(val); setLookupError(""); },
    onScan: handleBarcodeScan,
    inputRef: barcodeInputRef,
    enabled: !selectedProduct,
  });

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

  const handleSubmitClick = () => {
    if (!validate()) return;

    const isMarketBased = (selectedProduct as any)?.pricing_type === "MARKET_BASED";
    const diff = adjType === "Correction" ? qtyNum - currentQty : -qtyNum;
    const diffText = diff >= 0 ? `+${diff}` : String(diff);

    if (isMarketBased) {
      setAuthRequestType("market_adjustment");
      setAuthPayload({
        type: "market_adjustment",
        payload: {
          product_id: selectedProduct!.id,
          system_quantity: currentQty,
          physical_quantity: previewQty,
          reason: `${adjType}: ${reason.trim()}`,
          remarks: reason.trim(),
        },
      });
    } else {
      setAuthRequestType("stock_count_standard");
      setAuthPayload({
        type: "stock_count_standard",
        payload: {
          product_id: selectedProduct!.id,
          system_quantity: currentQty,
          physical_quantity: previewQty,
          reason: adjType,
          remarks: reason.trim(),
        },
      });
    }

    setAuthSummary([
      { label: "Product", value: selectedProduct!.product_name },
      { label: "Current Stock", value: `${currentQty} ${selectedProduct!.unit}` },
      { label: "Adjustment", value: `${diffText} ${selectedProduct!.unit} (${adjType})` },
      { label: "New Stock", value: `${previewQty} ${selectedProduct!.unit}` },
      { label: "Reason", value: reason.trim() },
    ]);

    setAuthModalOpen(true);
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
        onRestore={() => {
            if (recoverableDraft) {
                setSelectedProduct(recoverableDraft.selectedProduct);
                setAdjType(recoverableDraft.adjType);
                setQty(recoverableDraft.qty);
                setReason(recoverableDraft.reason);
            }
            setRecoverableDraft(null);
        }}
        onDiscard={() => {
          adjDraft.discardDraft();
          setSelectedProduct(prefillProduct || null);
          setAdjType(""); setQty(""); setReason("");
          setRecoverableDraft(null);
        }}
      />
      <Sheet open={open} onOpenChange={(v) => { if (!v) { onClose(); } }}>
        <SheetContent side="right" className="w-[90vw] sm:max-w-xl p-0 overflow-hidden flex flex-col gap-0 border-l border-gray-200 [&>button]:text-white">
          <SheetTitle className="sr-only">Stock Adjustment</SheetTitle>

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
                      ref={barcodeInputRef}
                      placeholder="Scan barcode then press Enter…"
                      value={barcodeInput}
                      onChange={(e) => { setBarcodeInput(e.target.value); setLookupError(""); }}
                      onKeyDown={handleBarcodeKeyDown}
                      onFocus={handleBarcodeFocus}
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
                    <p className="text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {lookupError}
                    </p>
                  )}
                  {errors.product && <p className="text-xs text-red-500">{errors.product}</p>}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{selectedProduct.product_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-gray-500">{selectedProduct.barcode}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs font-semibold text-amber-700">
                        Current: {formatQuantity(selectedProduct.quantity, selectedProduct.unit, selectedProduct.quantity_type)}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-gray-500 hover:text-red-600 shrink-0 ml-2"
                    onClick={() => { setSelectedProduct(null); setBarcodeInput(""); setSearchInput(""); setQty(""); }}
                  >
                    Change
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
                  const isSelected = adjType === t.label;
                  return (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => { setAdjType(t.label); setErrors((e) => ({ ...e, type: "" })); }}
                      className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className={`p-1.5 rounded-md mt-0.5 shrink-0 ${t.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-xs font-bold ${isSelected ? "text-amber-900" : "text-gray-800"}`}>{t.label}</p>
                        <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{t.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {errors.type && <p className="text-xs text-red-500">{errors.type}</p>}
            </div>

            {/* ── Step 3: Quantity ── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Step 3 — Quantity <span className="text-red-500">*</span></p>

              <div>
                <label className="text-xs text-gray-600 mb-1 block font-medium">
                  {adjType === "Correction"
                    ? "Actual physical count (new stock quantity)"
                    : "Quantity to deduct from inventory"
                  }
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={qty}
                    onChange={(e) => { setQty(e.target.value); setErrors((er) => ({ ...er, qty: "" })); }}
                    className="h-10 text-base font-bold w-40 border-gray-300 focus:border-amber-400"
                  />
                  <span className="text-sm font-semibold text-gray-600">
                    {selectedProduct?.unit || "units"}
                  </span>
                </div>
                {errors.qty && <p className="text-xs text-red-500 mt-1">{errors.qty}</p>}
              </div>

              {/* Stock Preview Pill */}
              {selectedProduct && qty && !isNaN(qtyNum) && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
                  <div>
                    <span className="text-gray-400 block">Current</span>
                    <span className="font-bold text-gray-700">{formatQuantity(currentQty, selectedProduct.unit, selectedProduct.quantity_type)}</span>
                  </div>
                  <span className="text-gray-300 font-bold">→</span>
                  <div>
                    <span className="text-gray-400 block">
                      {adjType === "Correction" ? "Correction" : "Adjustment"}
                    </span>
                    <span className={`font-bold ${adjType === "Correction" ? "text-blue-600" : "text-red-600"}`}>
                      {adjType === "Correction"
                        ? formatQuantity(qtyNum, selectedProduct.unit, selectedProduct.quantity_type)
                        : `-${formatQuantity(qtyNum, selectedProduct.unit, selectedProduct.quantity_type)}`
                      }
                    </span>
                  </div>
                  <span className="text-gray-300 font-bold">→</span>
                  <div>
                    <span className="text-gray-400 block">New Stock</span>
                    <span className={`font-bold text-sm ${previewQty < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {formatQuantity(previewQty, selectedProduct.unit, selectedProduct.quantity_type)}
                    </span>
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
              onClick={handleSubmitClick}
              disabled={loading}
            >
              <CheckCircle2 className="h-4 w-4" /> Save Adjustment
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dual Authorization Modal: Remote Request to Admin vs In-Terminal Override */}
      {authPayload && (
        <ClerkAuthModal
          open={authModalOpen}
          onClose={() => {
            setAuthModalOpen(false);
          }}
          requestType={authRequestType}
          createPayload={authPayload}
          title="Authorize Stock Adjustment"
          summary={authSummary}
          onRequestCreated={() => {
            adjDraft.commitDraft();
            onSaved();
          }}
          onApproved={(_adminName) => {
            adjDraft.commitDraft();
            onClose();
            onSaved();
          }}
        />
      )}
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

  // Real-time synchronization when requests are approved/rejected or inventory adjusted
  useRealtimeSync(["inventory", "requests", "products", "dashboard"], () => {
    setRefreshKey((k) => k + 1);
  });

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
          { label: "Total Adjustments", value: totalAdjustments, color: "text-slate-900", iconColor: "text-slate-600", bg: "bg-slate-50", icon: SlidersHorizontal },
          { label: "Damaged Items", value: damagedCount, color: "text-rose-700", iconColor: "text-rose-600", bg: "bg-rose-50", icon: Flame },
          { label: "Lost Items", value: lostCount, color: "text-orange-700", iconColor: "text-orange-600", bg: "bg-orange-50", icon: PackageX },
          { label: "Expired Items", value: expiredCount, color: "text-amber-700", iconColor: "text-amber-600", bg: "bg-amber-50", icon: Clock4 },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4 bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">{s.label}</p>
                </div>
                <div className={`p-2.5 rounded-xl ${s.bg} ${s.iconColor} shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* History table */}
      <Card className="overflow-hidden border border-slate-200/80 shadow-sm rounded-xl bg-white">
        <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Adjustment History</h2>
            <p className="text-xs text-slate-500 mt-0.5">Audit log of all stock adjustments</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search by product, barcode, or type…"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="pl-10 h-10 text-sm bg-white border-slate-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur border-b border-slate-200">
              <tr>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-16">ID</th>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider min-w-[200px]">Product</th>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-36">Type</th>
                <th className="text-center py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-32">Adjustment</th>
                <th className="text-center py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-24">Prev Qty</th>
                <th className="text-center py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-24">New Qty</th>
                <th className="text-left py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider min-w-[200px]">Reason / Reference</th>
                <th className="text-right py-3.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wider w-40">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="p-3.5 bg-slate-100 rounded-full text-slate-400">
                        <SlidersHorizontal className="h-7 w-7" />
                      </div>
                      <p className="font-semibold text-slate-700 text-sm">No adjustments found</p>
                      <p className="text-xs text-slate-400 max-w-xs">
                        No adjustment records match your search. Record a new adjustment when stock variances occur.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredHistory.map((r, idx) => (
                <tr key={r.id} className={`transition-colors hover:bg-slate-50/80 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                  <td className="py-3 px-4">
                    <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded shadow-sm">
                      #{r.id}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900 text-sm leading-tight">{r.product_name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{r.barcode}</p>
                  </td>
                  <td className="py-3 px-4"><TypeBadge type={r.action} /></td>
                  <td className="py-3 px-4 text-center">
                    {(() => {
                      const change = Number(r.quantity_change ?? 0);
                      const isPositive = change > 0;
                      const isZero = change === 0;
                      return (
                        <span className={`inline-flex items-center justify-center font-extrabold text-xs px-2.5 py-1 rounded-full tabular-nums shadow-sm ${
                          isPositive
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                            : isZero
                            ? 'text-slate-700 bg-slate-50 border border-slate-200'
                            : 'text-rose-700 bg-rose-50 border border-rose-200'
                        }`}>
                          {isPositive ? `+ ${change}` : isZero ? '0' : `− ${Math.abs(change)}`}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-xs font-semibold text-slate-500 tabular-nums">{r.quantity}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">{r.remaining_stock}</span>
                  </td>
                  <td className="py-3 px-4">
                    <p className="text-xs text-slate-700 line-clamp-2 max-w-[220px] font-medium">{r.reference || r.notes || "—"}</p>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <p className="text-xs font-semibold text-slate-800">{new Date(r.created_at).toLocaleDateString()}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
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
