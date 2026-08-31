import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AdjustmentReason, getInventory, getInventoryLogs, type CreateAdjustmentRequestPayload } from "@/shared/api/inventoryApi";
import { createStockCountRequest, getRequestHistory, type UnifiedRequest, type CreateStockCountPayload } from "@/shared/api/requestsApi";
import DraftRecoveryPrompt from "@/shared/components/DraftRecoveryPrompt";
import { useBarcodeScanner } from "@/shared/hooks/useBarcodeScanner";
import { DRAFT_KEYS, useDraftRecovery } from "@/shared/hooks/useDraftRecovery";
import { useRealtimeSync } from "@/shared/hooks/useRealtimeSync";
import ClerkAuthModal from "../components/ClerkAuthModal";
import ClerkBatchStockCountModal, { type BatchStockCountItem } from "../components/ClerkBatchStockCountModal";
import { formatQuantityParts } from "@/shared/utils/quantityFormat";
import {
    AlertCircle,
    AlertTriangle,
    Calendar,
    CheckCircle2,
    ClipboardList,
    Clock,
    Eye,
    Filter,
    History,
    Layers,
    Loader2,
    Minus,
    Package,
    PackagePlus,
    RefreshCw,
    RotateCcw,
    Scale,
    Search,
    ShoppingCart, SlidersHorizontal,
    Tag,
    TrendingDown,
    TrendingUp,
    User,
    X,
    XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Reason Lists ───────────────────────────────────────────────────────────────
const STANDARD_REASONS = [
  "Inventory Miscount",
  "Damaged Items",
  "Lost Items",
  "Newly Found Stock",
  "Encoding Error",
  "Other",
] as const;

const MARKET_BASED_REASONS = [
  "Drying/Moisture Loss",
  "Spillage",
  "Theft",
  "Processing Loss",
  "Warehouse Damage",
  "Other",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────
interface CountRow {
  productId: number;
  barcode: string;
  productName: string;
  category: string;
  unit: string;
  unit_abbreviation?: string;
  quantity_type?: "WHOLE_UNIT" | "WEIGHTED";
  unit_allow_decimal?: boolean;
  pricing_type?: "FIXED_PRICE" | "MARKET_BASED";
  systemQty: number;
  physicalCount: string; // string so input can be blank
  remarks: string;
  reason?: AdjustmentReason; // For Market-Based products
}

// ─── Difference badge ─────────────────────────────────────────────────────────
function DiffCell({ system, physical, quantityType, allowDecimal }: { system: number; physical: string; quantityType?: "WHOLE_UNIT" | "WEIGHTED"; allowDecimal?: boolean }) {
  if (physical === "") {
    return <span className="text-slate-300 text-sm font-mono">—</span>;
  }
  const physNum = parseFloat(physical);
  const diff = physNum - system;
  const useDecimal = allowDecimal ?? quantityType === "WEIGHTED";

  if (diff === 0) return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
      <Minus className="h-3 w-3" /> Match
    </span>
  );
  if (diff > 0) return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs">
      <TrendingUp className="h-3.5 w-3.5" /> +{useDecimal ? diff.toFixed(3) : Math.round(diff)} over
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
      <TrendingDown className="h-3.5 w-3.5" /> {useDecimal ? diff.toFixed(3) : Math.round(diff)} short
    </span>
  );
}

// ─── System Qty cell with inline movement breakdown ──────────────────────────
interface Breakdown { stockIn: number; sold: number; adjustments: number; }

function SystemQtyCell({ productId, systemQty, unit, quantityType }: { productId: number; systemQty: number; unit?: string; quantityType?: "WHOLE_UNIT" | "WEIGHTED" }) {
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);

  const isWeighted = quantityType === "WEIGHTED";

  // Format a breakdown number: decimals for weighted, whole numbers for unit-based
  const fmt = (n: number) => isWeighted ? parseFloat(n.toFixed(3)).toString() : Math.round(n).toString();

  useEffect(() => {
    getInventoryLogs({ product_id: productId, limit: 500 })
      .then((logs) => {
        const stockIn     = logs.filter((l) => l.transaction_type === "Stock In")
                               .reduce((s, l) => s + Math.abs(Number(l.quantity_change) || 0), 0);
        const sold        = logs.filter((l) => l.transaction_type === "Sale")
                               .reduce((s, l) => s + Math.abs(Number(l.quantity_change) || 0), 0);
        const returned    = logs.filter((l) => l.transaction_type === "Return")
                               .reduce((s, l) => s + Math.abs(Number(l.quantity_change) || 0), 0);
        const adjustments = logs.filter((l) => l.transaction_type === "Adjustment")
                               .reduce((s, l) => s + (Number(l.quantity_change) || 0), 0);
        setData({ stockIn, sold: sold - returned, adjustments });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [productId]);

  return (
    <div className="flex flex-col gap-1.5">
      {(() => {
        const parts = formatQuantityParts(systemQty, unit, quantityType);
        return (
          <div className="flex items-center gap-0.5">
            <span className="font-bold text-gray-900 text-lg leading-none">{parts.number}</span>
            {parts.unit && <span className="text-xs text-gray-500">{parts.unit}</span>}
          </div>
        );
      })()}
      {loading ? (
        <div className="flex items-center gap-1 text-gray-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="text-xs">loading…</span>
        </div>
      ) : data ? (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-semibold">
            <PackagePlus className="h-3 w-3" />+{fmt(data.stockIn)} received
          </span>
          <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold">
            <ShoppingCart className="h-3 w-3" />−{fmt(data.sold)} sold
          </span>
          {data.adjustments !== 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
              <SlidersHorizontal className="h-3 w-3" />
              {data.adjustments > 0 ? `+${fmt(data.adjustments)}` : fmt(data.adjustments)} adj
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Draft type ───────────────────────────────────────────────────────────────
interface StockCountDraft {
  /** Sparse: only rows that have been touched (physicalCount !== "") */
  countedRows: Array<{ productId: number; physicalCount: string; remarks: string; reason?: AdjustmentReason }>;
  savedAt: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClerkStockCount() {
  const [activeTab, setActiveTab] = useState<"session" | "history">("session");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CountRow[]>([]);
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countComplete, setCountComplete] = useState(false);
  const [sessionDate] = useState(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
  );

  // Batch Auth modal — shown when count session contains products with discrepancies
  const [batchDiscrepancies, setBatchDiscrepancies] = useState<BatchStockCountItem[]>([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { handleKeyDown: handleSearchKeyDown, handleFocus: handleSearchFocus } = useBarcodeScanner({
    setValue: setSearch,
    onScan: setSearch,
    inputRef: searchInputRef,
    enableGlobalScan: activeTab === "session" && !confirmOpen && !batchModalOpen,
  });

  // Real-time synchronization when requests are approved/rejected or inventory adjusted
  useRealtimeSync(["inventory", "requests", "products", "dashboard"], () => {
    setHistoryRefreshKey((k) => k + 1);
  });

  // ── Draft recovery ──────────────────────────────────────────────────────────
  const countDraft = useDraftRecovery<StockCountDraft>(DRAFT_KEYS.CLERK_STOCK_COUNT);
  const [recoverableDraft, setRecoverableDraft] = useState<StockCountDraft | null>(null);

  useEffect(() => {
    const draft = countDraft.getRecoverableDraft();
    if (draft && draft.countedRows.length > 0) {
      setRecoverableDraft(draft);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialise rows from real API, then apply any restored draft
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getInventory();
        const baseRows: CountRow[] = data.map((p) => ({
          productId: p.id,
          barcode: p.barcode,
          productName: p.product_name,
          category: p.category,
          unit: p.unit,
          unit_abbreviation: p.unit_abbreviation,
          quantity_type: p.quantity_type,
          pricing_type: (p as any).pricing_type,
          systemQty: p.quantity,
          physicalCount: "",
          remarks: "",
          reason: undefined,
        }));

        // If the user just restored a draft, overlay the saved counts on top.
        // We do NOT hold rows in state at this point — the user will be prompted
        // separately via DraftRecoveryPrompt.  We store them directly here after
        // the user clicks "Restore".
        setRows(baseRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to load products:", message.replace(/[\r\n\t]/g, " "));
        toast.error("Failed to load products");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Auto-save draft whenever any row's physicalCount changes
  useEffect(() => {
    const counted = rows.filter((r) => r.physicalCount !== "");
    if (counted.length > 0) {
      countDraft.saveDraft({
        countedRows: counted.map((r) => ({
          productId: r.productId,
          physicalCount: r.physicalCount,
          remarks: r.remarks,
          reason: r.reason,
        })),
        savedAt: new Date().toISOString(),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Apply restored draft once rows are loaded
  const applyDraft = (draft: StockCountDraft) => {
    setRows((prev) => prev.map((r) => {
      const saved = draft.countedRows.find((c) => c.productId === r.productId);
      if (!saved) return r;
      return { ...r, physicalCount: saved.physicalCount, remarks: saved.remarks, reason: saved.reason };
    }));
  };

  // Reset count sheet
  const handleReset = () => {
    setRows((prev) => prev.map((r) => ({ ...r, physicalCount: "", remarks: "" })));
    setCountComplete(false);
    countDraft.discardDraft();
    toast.info("Count sheet cleared");
  };

  // Update a single row's physicalCount, remarks, or reason
  const updateRow = (productId: number, field: "physicalCount" | "remarks" | "reason", value: string) => {
    if (field === "physicalCount" && value !== "" && (isNaN(Number(value)) || Number(value) < 0)) return;
    setRows((prev) =>
      prev.map((r) => r.productId === productId ? { ...r, [field]: value } : r)
    );
  };

  // Filtered rows
  const filtered = useMemo(() =>
    rows.filter(
      (r) =>
        search === "" ||
        r.productName.toLowerCase().includes(search.toLowerCase()) ||
        r.barcode.toLowerCase().includes(search.toLowerCase()) ||
        r.category.toLowerCase().includes(search.toLowerCase())
    ),
    [rows, search]
  );

  // Stats
  const countedRows  = rows.filter((r) => r.physicalCount !== "");
  const matchRows    = countedRows.filter((r) => parseFloat(r.physicalCount) === r.systemQty);
  const overRows     = countedRows.filter((r) => parseFloat(r.physicalCount) > r.systemQty);
  const shortRows    = countedRows.filter((r) => parseFloat(r.physicalCount) < r.systemQty);

  const canComplete = countedRows.length > 0;

  // Save stock count — submit corrections via API
  const handleSave = async () => {
    try {
      const rowsWithDiff = countedRows.filter(
        (r) => parseFloat(r.physicalCount) !== r.systemQty
      );

      // Validate all rows with discrepancy have a reason
      for (const row of rowsWithDiff) {
        if (!row.reason) {
          throw new Error(`Reason required for product with discrepancy: ${row.productName}`);
        }
        if (row.reason === "Other" && !row.remarks.trim()) {
          throw new Error(`Remarks required when reason is 'Other' for: ${row.productName}`);
        }
      }

      if (rowsWithDiff.length > 0) {
        // Build batch discrepancy items for unified review
        const batchItems: BatchStockCountItem[] = rowsWithDiff.map((row) => ({
          productId: row.productId,
          productName: row.productName,
          barcode: row.barcode,
          unit: row.unit || "",
          quantity_type: row.quantity_type,
          systemQty: Number(row.systemQty),
          physicalCount: row.physicalCount,
          reason: row.reason || "Inventory Miscount",
          remarks: row.remarks?.trim() || "",
          is_market: row.pricing_type === "MARKET_BASED",
        }));

        setBatchDiscrepancies(batchItems);
        setBatchModalOpen(true);
      } else {
        toast.success(
          `Stock count completed — all ${countedRows.length} counted product(s) match system inventory.`
        );
        setCountComplete(true);
        setHistoryRefreshKey((k) => k + 1);
        countDraft.commitDraft();
        setRows((prev) =>
          prev.map((r) => {
            if (r.physicalCount !== "") {
              return { ...r, systemQty: parseFloat(r.physicalCount), physicalCount: "", remarks: "", reason: undefined };
            }
            return r;
          })
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Failed to save stock count:", message.replace(/[\r\n\t]/g, " "));
      toast.error(message || "Failed to save stock count");
    }
  };

  return (
    <div className="space-y-6">
      {/* Draft recovery prompt */}
      <DraftRecoveryPrompt
        draft={recoverableDraft}
        formLabel="Stock Count"
        savedSummary={
          recoverableDraft
            ? `${recoverableDraft.countedRows.length} product(s) counted${recoverableDraft.savedAt ? ` · Saved: ${new Date(recoverableDraft.savedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}`
            : undefined
        }
        onRestore={() => {
          applyDraft(recoverableDraft!);
          setRecoverableDraft(null);
          toast.success("Draft restored — continue where you left off.");
        }}
        onDiscard={() => {
          countDraft.discardDraft();
          setRecoverableDraft(null);
          toast.info("Draft discarded.");
        }}
      />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Count</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Physical count session — {sessionDate}
          </p>
        </div>
        {activeTab === "session" && (
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" /> Clear Sheet
            </Button>
            <Button
              disabled={!canComplete || loading}
              onClick={() => setConfirmOpen(true)}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete Stock Count
              {canComplete && (
                <span className="ml-1 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {countedRows.length}
                </span>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("session")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeTab === "session"
              ? "border-purple-600 text-purple-700"
              : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          <span>Count Session</span>
          {countedRows.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
              {countedRows.length} counted
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
            activeTab === "history"
              ? "border-purple-600 text-purple-700"
              : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
          }`}
        >
          <History className="h-4 w-4" />
          <span>Count History</span>
        </button>
      </div>

      {activeTab === "session" ? (
        <>
          {/* Count complete banner */}
          {countComplete && (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Stock count completed successfully</p>
                <p className="text-xs text-green-600 mt-0.5">
                  Discrepancy adjustment requests have been recorded. You can view them in the Count History tab.
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-purple-700 border-purple-200 hover:bg-purple-50"
                  onClick={() => setActiveTab("history")}>
                  <History className="h-3.5 w-3.5" /> View History
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 text-green-700 hover:bg-green-100"
                  onClick={() => setCountComplete(false)}>
                  <RefreshCw className="h-3.5 w-3.5" /> New Count
                </Button>
              </div>
            </div>
          )}

          {/* Progress summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-4"><Skeleton className="h-12 w-full" /></Card>
              ))
            ) : (
              <>
                <Card className="p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">{rows.length}</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">Total Products</p>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${rows.length > 0 ? (countedRows.length / rows.length) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{countedRows.length} counted</p>
                </Card>
                <Card className="p-4 text-center bg-green-50 border-green-100">
                  <p className="text-2xl font-bold text-green-600">{matchRows.length}</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">Matched</p>
                </Card>
                <Card className="p-4 text-center bg-blue-50 border-blue-100">
                  <p className="text-2xl font-bold text-blue-600">{overRows.length}</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">Over Count</p>
                </Card>
                <Card className="p-4 text-center bg-red-50 border-red-100">
                  <p className="text-2xl font-bold text-red-600">{shortRows.length}</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">Short Count</p>
                </Card>
              </>
            )}
          </div>

          {/* Product count table card */}
          <Card className="overflow-hidden border border-slate-200/80 shadow-sm rounded-xl bg-white">
            <div className="px-6 py-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {search
                    ? <>{filtered.length} product{filtered.length !== 1 ? "s" : ""} matching &ldquo;{search}&rdquo;</>
                    : <>{rows.length} products in count session</>}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Enter physical counts to automatically calculate variances</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search products by name or barcode…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={handleSearchFocus}
                  className="pl-10 h-10 text-sm bg-white border-slate-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900 text-white shadow-sm">
                  <tr>
                    {[
                      { label: "#",              cls: "w-12 text-center" },
                      { label: "Barcode",        cls: "w-36" },
                      { label: "Product Name",   cls: "min-w-[200px]" },
                      { label: "Category",       cls: "w-32" },
                      { label: "Unit",           cls: "text-center w-20" },
                      { label: "System Qty",     cls: "text-center min-w-[140px]" },
                      { label: "Physical Count", cls: "text-center w-36" },
                      { label: "Difference",     cls: "text-center w-32" },
                      { label: "Reason",         cls: "min-w-[160px]" },
                      { label: "Remarks",        cls: "min-w-[160px]" },
                    ].map(({ label, cls }) => (
                      <th key={label} className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider whitespace-nowrap text-left ${cls}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="bg-white">
                        {Array.from({ length: 10 }).map((_, j) => (
                          <td key={j} className="py-3.5 px-4"><Skeleton className="h-4 w-full rounded" /></td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-16 text-center bg-white">
                        <div className="flex flex-col items-center gap-2.5">
                          <div className="p-3.5 bg-slate-100 rounded-full text-slate-400">
                            <ClipboardList className="h-7 w-7" />
                          </div>
                          <p className="font-semibold text-slate-700 text-sm">No products match your search</p>
                          <p className="text-xs text-slate-400">Try adjusting your search terms</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, idx) => {
                      const physNum  = row.physicalCount !== "" ? parseFloat(row.physicalCount) : 0;
                      const hasDiff  = row.physicalCount !== "" && physNum !== row.systemQty;
                      const isOver   = hasDiff && physNum > row.systemQty;
                      const isShort  = hasDiff && physNum < row.systemQty;
                      const isCounted = row.physicalCount !== "";
                      const isMarketBased = row.pricing_type === "MARKET_BASED";

                      const rowBg = isOver   ? "bg-blue-50/60 border-l-4 border-l-blue-500"
                                  : isShort  ? "bg-rose-50/60 border-l-4 border-l-rose-500"
                                  : isCounted ? "bg-emerald-50/60 border-l-4 border-l-emerald-500"
                                  : idx % 2 === 0 ? "bg-white" : "bg-slate-50/30";

                      return (
                        <tr key={row.productId} className={`transition-colors hover:bg-slate-50/90 ${rowBg}`}>
                          {/* Row number */}
                          <td className="py-3 px-4 text-center text-xs text-slate-400 font-mono">{idx + 1}</td>

                          {/* Barcode */}
                          <td className="py-3 px-4">
                            <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                              {row.barcode}
                            </span>
                          </td>

                          {/* Product name */}
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900 text-sm leading-tight">{row.productName}</p>
                            {isMarketBased && (
                              <span className="inline-block mt-1 text-[11px] font-semibold text-orange-700 bg-orange-100/80 border border-orange-200 px-2 py-0.5 rounded-full">
                                Market-Based
                              </span>
                            )}
                          </td>

                          {/* Category */}
                          <td className="py-3 px-4">
                            <span className="text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full inline-block">
                              {row.category}
                            </span>
                          </td>

                          {/* Unit */}
                          <td className="py-3 px-4 text-center text-xs font-medium text-slate-600">{row.unit}</td>

                          {/* System Qty + breakdown */}
                          <td className="py-3 px-4">
                            <SystemQtyCell productId={row.productId} systemQty={row.systemQty} unit={row.unit_abbreviation} quantityType={row.quantity_type} />
                          </td>

                          {/* Physical count input */}
                          <td className="py-3 px-4 text-center">
                            <Input
                              type="number"
                              min={0}
                              step={row.quantity_type === "WEIGHTED" ? "0.001" : "1"}
                              placeholder="—"
                              value={row.physicalCount}
                              onChange={(e) => updateRow(row.productId, "physicalCount", e.target.value)}
                              className={`h-9 w-28 text-center font-bold text-sm mx-auto rounded-lg transition-all ${
                                isOver    ? "border-2 border-blue-500 bg-white text-blue-700 focus:ring-2 focus:ring-blue-200"
                                : isShort ? "border-2 border-rose-500 bg-white text-rose-700 focus:ring-2 focus:ring-rose-200"
                                : isCounted ? "border-2 border-emerald-500 bg-white text-emerald-700 focus:ring-2 focus:ring-emerald-200"
                                : "border-slate-300 bg-white text-slate-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                              }`}
                            />
                          </td>

                          {/* Difference */}
                          <td className="py-3 px-4 text-center">
                            <DiffCell system={row.systemQty} physical={row.physicalCount} quantityType={row.quantity_type} allowDecimal={row.unit_allow_decimal} />
                          </td>

                          {/* Reason (for products with discrepancy) */}
                          <td className="py-3 px-4">
                            {hasDiff ? (
                              <select
                                value={row.reason || ""}
                                onChange={(e) => updateRow(row.productId, "reason", e.target.value)}
                                className={`h-9 text-xs border rounded-lg px-2 w-full transition-all ${
                                  hasDiff && !row.reason ? "border-rose-400 bg-rose-50/50 text-rose-800" : "border-slate-300 bg-white text-slate-800 focus:border-purple-500"
                                }`}
                              >
                                <option value="">Select reason…</option>
                                {(isMarketBased ? MARKET_BASED_REASONS : STANDARD_REASONS).map((reason) => (
                                  <option key={reason} value={reason}>{reason}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Remarks (only when Other is selected) */}
                          <td className="py-3 px-4">
                            {row.reason === "Other" ? (
                              <Input
                                placeholder="Specify reason…"
                                value={row.remarks}
                                onChange={(e) => updateRow(row.productId, "remarks", e.target.value)}
                                className={`h-9 text-xs border rounded-lg ${
                                  !row.remarks.trim() ? "border-rose-400 bg-rose-50/50 focus:border-rose-500" : "border-slate-300 bg-white"
                                }`}
                              />
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            {!loading && (
              <div className="px-6 py-3.5 border-t border-slate-200/80 bg-slate-50/80 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm" /> Matched
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shadow-sm" /> Over Count
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm" /> Short Count
                  </span>
                </div>
                <Button
                  disabled={!canComplete}
                  onClick={() => setConfirmOpen(true)}
                  className="gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-sm text-xs h-9 px-4"
                >
                  <CheckCircle2 className="h-4 w-4" /> Complete Stock Count
                </Button>
              </div>
            )}
          </Card>
        </>
      ) : (
        /* History Tab */
        <StockCountHistoryTab refreshKey={historyRefreshKey} />
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-purple-600" />
              Complete Stock Count
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have counted <strong>{countedRows.length}</strong> product(s).{" "}
              {shortRows.length + overRows.length > 0
                ? `${shortRows.length + overRows.length} product(s) have a quantity difference and require a reason for admin approval.`
                : "All counted products match the system quantity."}
              {" "}Ensure all discrepancies have a reason selected before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Mini summary in confirm dialog */}
          {countedRows.filter((r) => parseFloat(r.physicalCount) !== r.systemQty).length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">Product</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">System</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">Physical</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-600">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {countedRows
                    .filter((r) => parseFloat(r.physicalCount) !== r.systemQty)
                    .map((r) => {
                      const physNum = parseFloat(r.physicalCount);
                      const diff = physNum - r.systemQty;
                      const isWeighted = r.quantity_type === "WEIGHTED";
                      const displayDiff = isWeighted ? diff.toFixed(3) : Math.round(diff);
                      return (
                        <tr key={r.productId} className="border-b border-gray-50 last:border-0">
                          <td className="py-2 px-3 font-medium text-gray-800 truncate max-w-[140px]">{r.productName}</td>
                          <td className="py-2 px-2 text-center text-gray-500">{r.systemQty}</td>
                          <td className="py-2 px-2 text-center font-bold text-gray-800">{r.physicalCount}</td>
                          <td className={`py-2 px-2 text-center font-bold ${diff > 0 ? "text-blue-600" : "text-red-600"}`}>
                            {diff > 0 ? `+${displayDiff}` : displayDiff}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => { setConfirmOpen(false); handleSave(); }}
            >
              Confirm & Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unified Batch Stock Count Auth Modal */}
      {batchModalOpen && batchDiscrepancies.length > 0 && (
        <ClerkBatchStockCountModal
          open={batchModalOpen}
          onClose={() => {
            setBatchModalOpen(false);
            setBatchDiscrepancies([]);
          }}
          items={batchDiscrepancies}
          onApproved={(adminName, approvedProductIds, rejectedProductIds) => {
            setBatchModalOpen(false);
            setBatchDiscrepancies([]);
            setCountComplete(true);
            setHistoryRefreshKey((k) => k + 1);
            countDraft.commitDraft();
            setRows((prev) =>
              prev.map((r) => {
                if (approvedProductIds.includes(r.productId)) {
                  return {
                    ...r,
                    systemQty: parseFloat(r.physicalCount) || r.systemQty,
                    physicalCount: "",
                    remarks: "",
                    reason: undefined,
                  };
                }
                if (rejectedProductIds && rejectedProductIds.includes(r.productId)) {
                  return {
                    ...r,
                    physicalCount: "",
                    remarks: "",
                    reason: undefined,
                  };
                }
                if (r.physicalCount !== "" && parseFloat(r.physicalCount) === r.systemQty) {
                  return { ...r, physicalCount: "", remarks: "", reason: undefined };
                }
                return r;
              })
            );
            if (rejectedProductIds && rejectedProductIds.length > 0) {
              toast.info(
                `${approvedProductIds.length} item(s) approved, ${rejectedProductIds.length} item(s) rejected by ${adminName}.`
              );
            } else {
              toast.success(`All ${approvedProductIds.length} item(s) approved by ${adminName}!`);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Stock Count History Tab ──────────────────────────────────────────────────

function StockCountHistoryTab({ refreshKey }: { refreshKey: number }) {
  const [historyRows, setHistoryRows] = useState<UnifiedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<UnifiedRequest | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRequestHistory({ limit: 100 });
      // Only display history records that have been approved by the admin
      const stockCounts = (data || []).filter(
        (r) =>
          (r.type === "STOCK_COUNT_STANDARD" || r.type === "STOCK_COUNT_MARKET") &&
          ["approved", "completed"].includes((r.status || "").toLowerCase())
      );
      setHistoryRows(stockCounts);
    } catch (err) {
      console.error("Failed to load stock count history:", err);
      toast.error("Failed to load stock count history");
    } finally {
      setLoading(false);
    }
  }, []);

  useRealtimeSync(["requests", "inventory"], () => {
    loadHistory();
  });

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  const filtered = useMemo(() => {
    return historyRows.filter((r) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !search ||
        (r.product_name || "").toLowerCase().includes(q) ||
        (r.barcode || "").toLowerCase().includes(q) ||
        (r.reference || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q) ||
        (r.remarks || "").toLowerCase().includes(q) ||
        (r.requested_by_name || "").toLowerCase().includes(q) ||
        (r.approved_by_name || "").toLowerCase().includes(q);

      const matchesType = typeFilter === "all" || r.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [historyRows, search, typeFilter]);

  // Statistics — strictly for approved counts
  const totalApproved = historyRows.length;
  const standardApproved = historyRows.filter((r) => r.type === "STOCK_COUNT_STANDARD").length;
  const marketApproved = historyRows.filter((r) => r.type === "STOCK_COUNT_MARKET").length;
  const surplusCount = historyRows.filter((r) => (r.difference ?? 0) > 0).length;

  return (
    <div className="space-y-6">
      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Approved Counts", value: totalApproved, color: "text-emerald-700", iconColor: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle2 },
          { label: "Standard Products", value: standardApproved, color: "text-blue-700", iconColor: "text-blue-600", bg: "bg-blue-50", icon: Package },
          { label: "Market-Based Products", value: marketApproved, color: "text-orange-700", iconColor: "text-orange-600", bg: "bg-orange-50", icon: Scale },
          { label: "Surplus Counts (+)", value: surplusCount, color: "text-purple-700", iconColor: "text-purple-600", bg: "bg-purple-50", icon: TrendingUp },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4 bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
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

      {/* History Table Container */}
      <Card className="overflow-hidden border border-slate-200 shadow-sm rounded-xl bg-white">
        {/* Controls */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Search product, barcode, reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 text-sm bg-white border-slate-300 rounded-lg focus:border-purple-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 text-xs font-semibold px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 focus:border-purple-500 focus:outline-none"
            >
              <option value="all">All Count Types</option>
              <option value="STOCK_COUNT_STANDARD">Standard Products</option>
              <option value="STOCK_COUNT_MARKET">Market-Based Products</option>
            </select>

            <Button variant="outline" size="sm" onClick={loadHistory} className="gap-1.5 h-10 border-slate-300 text-slate-700">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-900 text-white">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-left whitespace-nowrap">Date & Time</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-left whitespace-nowrap">Reference</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-left min-w-[200px]">Product</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-left whitespace-nowrap">Type</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-center whitespace-nowrap">Variance (Sys → Count)</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-left min-w-[160px]">Reason</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-center whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-left whitespace-nowrap">Counted By</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase text-center whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="py-3.5 px-4"><Skeleton className="h-4 w-full rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center bg-white">
                    <div className="flex flex-col items-center gap-2.5">
                      <div className="p-3.5 bg-slate-100 rounded-full text-slate-400">
                        <History className="h-7 w-7" />
                      </div>
                      <p className="font-semibold text-slate-700 text-sm">No stock count records found</p>
                      <p className="text-xs text-slate-400">Completed counts with discrepancy logs will appear here</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => {
                  const statusLower = (item.status || "").toLowerCase();
                  const isApproved = statusLower === "approved" || statusLower === "completed";
                  const isRejected = statusLower === "rejected";
                  const isPending = statusLower === "pending" || statusLower === "pending_approval";

                  const diff = item.difference !== undefined
                    ? item.difference
                    : ((item.physical_quantity ?? 0) - (item.system_quantity ?? 0));

                  const isMarket = item.type === "STOCK_COUNT_MARKET";
                  const allowDecimal = item.unit_allow_decimal ?? item.quantity_type === "WEIGHTED";
                  const displayDiff = allowDecimal ? diff.toFixed(3) : Math.round(diff);

                  return (
                    <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                      {/* Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {item.prepared_at ? new Date(item.prepared_at).toLocaleString("en-PH", {
                          month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
                        }) : "—"}
                      </td>

                      {/* Reference */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-bold text-purple-900 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                          {item.reference}
                        </span>
                      </td>

                      {/* Product */}
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-900 text-sm">{item.product_name || "—"}</p>
                        <p className="font-mono text-xs text-slate-400">{item.barcode}</p>
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isMarket ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                            Market-Based
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            Standard
                          </span>
                        )}
                      </td>

                      {/* Variance */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5 text-xs">
                          <span className="font-medium text-slate-500">{item.system_quantity ?? "—"}</span>
                          <span className="text-slate-300">→</span>
                          <span className="font-bold text-slate-900">{item.physical_quantity ?? "—"}</span>
                          <span className={`ml-1 font-bold px-1.5 py-0.5 rounded text-[11px] ${
                            diff > 0
                              ? "bg-blue-50 text-blue-700"
                              : diff < 0
                              ? "bg-rose-50 text-rose-700"
                              : "bg-emerald-50 text-emerald-700"
                          }`}>
                            {diff > 0 ? `+${displayDiff}` : displayDiff}
                          </span>
                        </div>
                      </td>

                      {/* Reason & Remarks */}
                      <td className="py-3.5 px-4 text-xs">
                        <p className="font-medium text-slate-800">{item.reason || "—"}</p>
                        {item.remarks && <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{item.remarks}</p>}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" /> Approved
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </td>

                      {/* Counted By */}
                      <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {item.requested_by_name || "—"}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedItem(item)}
                          className="h-8 px-2.5 text-xs text-purple-700 hover:text-purple-900 hover:bg-purple-50 font-semibold gap-1"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filtered.length} discrepancy record{filtered.length !== 1 ? "s" : ""}</span>
          <span>Stock Count History Log</span>
        </div>
      </Card>

      {/* Slide-over Detail Sheet */}
      <Sheet open={!!selectedItem} onOpenChange={(o) => { if (!o) setSelectedItem(null); }}>
        <SheetContent side="right" className="w-[90vw] sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden border-l border-gray-200 [&>button]:text-white">
          <SheetTitle className="sr-only">Stock Count Details</SheetTitle>
          {selectedItem && (
            <>
              {/* Header */}
              <div className="px-6 py-4 bg-purple-900 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-white/20 rounded-lg">
                    <ClipboardList className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Stock Count Details</h3>
                    <p className="text-xs text-purple-200 font-mono mt-0.5">{selectedItem.reference}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedItem(null)} className="text-white/80 hover:text-white transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm bg-slate-50/50">
                {/* Product details card */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-slate-900 text-base">{selectedItem.product_name}</p>
                      <p className="font-mono text-xs text-slate-500">{selectedItem.barcode}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      (selectedItem.status || "").toLowerCase().includes("approved")
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : (selectedItem.status || "").toLowerCase().includes("reject")
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {selectedItem.status}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400">Category:</span>{" "}
                      <span className="font-semibold text-slate-800">{selectedItem.category_name || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Product Type:</span>{" "}
                      <span className="font-semibold text-slate-800">
                        {selectedItem.type === "STOCK_COUNT_MARKET" ? "Market-Based" : "Standard"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Variance breakdown card */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Count Comparison</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-400 block font-medium">System Expected</span>
                      <span className="text-lg font-bold text-slate-700">
                        {selectedItem.system_quantity ?? "0"} {selectedItem.unit_abbreviation}
                      </span>
                    </div>

                    <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200">
                      <span className="text-[11px] text-purple-600 block font-medium">Physical Count</span>
                      <span className="text-lg font-bold text-purple-900">
                        {selectedItem.physical_quantity ?? "0"} {selectedItem.unit_abbreviation}
                      </span>
                    </div>

                    {(() => {
                      const diff = selectedItem.difference !== undefined
                        ? selectedItem.difference
                        : ((selectedItem.physical_quantity ?? 0) - (selectedItem.system_quantity ?? 0));
                      const isOver = diff > 0;
                      const isShort = diff < 0;
                      return (
                        <div className={`p-2.5 rounded-lg border ${
                          isOver ? "bg-blue-50 border-blue-200 text-blue-700" : isShort ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                        }`}>
                          <span className="text-[11px] block font-medium">Variance</span>
                          <span className="text-lg font-bold">
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Discrepancy Reason & Remarks */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Discrepancy Details</p>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-slate-400">Selected Reason:</span>
                      <p className="font-semibold text-slate-900 mt-0.5">{selectedItem.reason || "—"}</p>
                    </div>
                    {selectedItem.remarks && (
                      <div className="pt-2">
                        <span className="text-slate-400">Remarks / Explanation:</span>
                        <p className="p-2.5 bg-slate-50 rounded border border-slate-200 text-slate-800 mt-1">
                          {selectedItem.remarks}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audit and Approval Info */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Audit & Approval Trail</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block">Counted By</span>
                      <span className="font-semibold text-slate-800">{selectedItem.requested_by_name || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Date & Time</span>
                      <span className="font-semibold text-slate-800">
                        {selectedItem.prepared_at ? new Date(selectedItem.prepared_at).toLocaleString("en-PH", {
                          month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
                        }) : "—"}
                      </span>
                    </div>
                    {selectedItem.approved_by_name && (
                      <div>
                        <span className="text-slate-400 block">Reviewed By</span>
                        <span className="font-semibold text-slate-800">{selectedItem.approved_by_name}</span>
                      </div>
                    )}
                    {selectedItem.approved_at && (
                      <div>
                        <span className="text-slate-400 block">Review Date</span>
                        <span className="font-semibold text-slate-800">
                          {new Date(selectedItem.approved_at).toLocaleString("en-PH", {
                            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit"
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedItem.rejection_reason && (
                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-rose-500 font-bold text-xs block">Rejection Reason:</span>
                      <p className="p-2.5 bg-rose-50 rounded border border-rose-200 text-rose-800 text-xs mt-1">
                        {selectedItem.rejection_reason}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-white border-t border-gray-200 flex justify-end shrink-0">
                <Button variant="outline" onClick={() => setSelectedItem(null)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
